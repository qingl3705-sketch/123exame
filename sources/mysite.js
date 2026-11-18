/* ------------------------------------------------------------------
 * HentaiPark 站点插件模板  ·  apiVersion 2
 * 用法：把 example.com 换成目标站点，把 4 处「选择器」改成该站真实结构。
 * 校验：key 必须等于文件名（mysite.js -> key: 'mysite'），version 三段数字。
 * 该文件可以被三种方式安装：
 *   1) 应用内「本地导入」直接粘贴本文件全部文本；
 *   2) 「添加站点」输入单个脚本 URL；
 *   3) 放进仓库目录，由 index.json 分发。
 * ------------------------------------------------------------------ */
Park.register({
  // ---- 身份（安装后 key 不可再改）----
  key: 'mysite',
  name: '我的站点',
  version: '0.0.1',
  minAppVersion: '0.9.2',
  type: 'comic',            // comic | video | article | novel | game | tavern ...
  category: 'doujin',       // doujin|gallery|jav|shortvideo|novel|feed|illustration|asmr|live|other
  color: '#3B82F6',
  description: '自定义站点（模板）',
  language: 'zh-Hans',

  // ---- 网络与站点边界 ----
  // domains 是 Cookie 分区、浏览器模式同源校验、媒体鉴权的唯一依据，必须写全。
  homepage: 'https://example.com',
  domains: ['example.com'],
  network: { mode: 'native', origin: 'https://example.com' },
  // 只要用到视频流才需要 media；纯图源可整段删掉。
  media: { mode: 'native', scope: 'session', origin: 'https://example.com' },
  imageHeaders: { Referer: 'https://example.com/' },

  // ---- 链接识别（应用内粘贴链接时用）----
  idPattern: '^[a-z0-9][a-z0-9_-]{1,80}$',
  idExample: 'abc-123',
  linkPatterns: ['example\\.com/item/([a-z0-9][a-z0-9_-]{1,80})(?:[/?#]|$)'],

  // ---- 首页 feed 与搜索 ----
  defaultFeed: 'latest',
  feeds: [{ key: 'latest', label: '最新' }],
  searchHint: '输入关键词',

  BASE: 'https://example.com',

  // 统一取页：所有请求都必须落在上面声明的 domains 内，否则宿主会拒绝。
  async getPage(path, params = {}) {
    const r = await this.http.get(this.BASE + path, { params });
    if (r.status === 404) throw Park.error('NOT_FOUND', '内容不存在');
    if (!r.ok) throw Park.error('HTTP', 'HTTP {status}', { params: { status: r.status }, status: r.status });
    if (r.body.length > 8 * 1024 * 1024) throw Park.error('PARSE', '页面过大');
    return Park.html.parse(r.body);
  },

  // 列表卡片解析：改这里的 4 个选择器
  cards(doc) {
    const items = [];
    for (const el of doc.querySelectorAll('.item')) {           // ← 卡片容器
      const a = el.querySelector('a[href]');                     // ← 详情链接
      if (!a) continue;
      let url;
      try { url = new URL(a.getAttribute('href'), this.BASE); } catch (_) { continue; }
      const m = /^\/item\/([a-z0-9][a-z0-9_-]{1,80})$/.exec(url.pathname);
      if (!m || items.some((i) => i.id === m[1])) continue;
      const img = el.querySelector('img');                       // ← 封面
      items.push({
        id: m[1],
        title: Park.html.text(a) || m[1],
        cover: img ? Park.url.parse(img.getAttribute('src') || '', this.BASE, [url.hostname])?.href || '' : '',
        coverAspect: 2 / 3,
        duration: '',
        authors: [],
        tags: [],
      });
    }
    return items;
  },

  async listing(path, req, params = {}) {
    const page = Math.max(1, Math.floor(Number(req.page) || 1));
    const doc = await this.getPage(path, { ...params, ...(page > 1 ? { page } : {}) });
    let totalPages = page;
    for (const a of doc.querySelectorAll('a[href]')) {           // 末页探测，可按站点改
      const m = /[?&]page=(\d+)(?:&|$)/.exec(a.getAttribute('href') || '');
      if (m) totalPages = Math.max(totalPages, Number(m[1]));
    }
    return { items: this.cards(doc), page, totalPages, hasNext: page < totalPages || !!doc.querySelector('a.next') };
  },

  async feed(key, req) {
    if (key !== 'latest') throw Park.error('CONFIG', '未知列表');
    return this.listing('/latest', req);
  },

  async search(req) {
    const keyword = String(req.keyword || '').trim();
    if (!keyword) return { items: [], page: 1, totalPages: 1, hasNext: false };
    return this.listing('/search', req, { q: keyword });
  },

  // 详情：字段名固定，缺的可以不返回
  async detail(id) {
    const doc = await this.getPage('/item/' + id);
    const title = Park.html.text(doc.querySelector('h1'));
    if (!title) throw Park.error('NOT_FOUND', '内容不存在');
    const tags = [];
    for (const a of doc.querySelectorAll('.tags a[href]')) {
      const label = Park.html.text(a);
      if (label) tags.push({ name: label, keyword: label, filters: {} });
    }
    return {
      id,
      title,
      cover: Park.url.parse(doc.querySelector('img.cover')?.getAttribute('src') || '', this.BASE, [new URL(this.BASE).hostname])?.href || '',
      coverAspect: 2 / 3,
      url: this.BASE + '/item/' + id,
      authors: [],
      duration: '',
      uploaded: '',
      description: Park.html.text(doc.querySelector('.desc')),
      tags: tags.length ? [{ namespace: 'tag', label: '标签', tags }] : [],
      related: [],
    };
  },

  // 章节：图片型站点用它拿图（返回数组即可，具体字段见 SOURCE_API.md「章节」）
  async chapter(id, chapterId) {
    const doc = await this.getPage('/item/' + id + '/' + (chapterId || '1'));
    const images = [];
    for (const img of doc.querySelectorAll('.reader img')) {
      const href = Park.url.parse(img.getAttribute('src') || img.getAttribute('data-src') || '', this.BASE, [new URL(this.BASE).hostname]);
      if (href) images.push(href.href);
    }
    if (!images.length) throw Park.error('PARSE', '未解析到图片');
    // 契约：chapter 返回 { pages: [...] }，图片地址已知时直接给 url
    return { pages: images.map((u) => ({ url: u })) };
  },

  // 视频源（可选）：type 改成 'video' 后再启用本段。
  // 只要存在 videos 方法，manifest.capabilities.videos 就会变成 true，界面会显示视频入口，
  // 所以纯图源务必保持注释状态。
  //
  // async videos(id) {
  //   const doc = await this.getPage('/item/' + id);
  //   const url = doc.querySelector('video source')?.getAttribute('src') || '';
  //   if (!/^https:\/\/[^\s#]+\.m3u8(\?|$)/.test(url)) throw Park.error('UNSUPPORTED', '没有可用的 HLS 流');
  //   return [{ url, quality: 1080, label: '原画', format: 'hls', preferred: true,
  //             headers: { Referer: this.BASE + '/item/' + id } }];
  // },
});