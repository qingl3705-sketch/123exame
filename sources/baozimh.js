/* BaoziManga · v5.0.0 · apiVersion 2
 * 依据 Mihon 扩展 tachiyomi-zh.baozimanhuaplus-v1.6.6 反编译结果重写（jadx）：
 *   列表 API : {domain}/api/bzmhq/amp_comic_list?type=all&region=all&state=all&filter=*&page=N&limit=36&language=tw
 *   响应字段 : items[].comic_id / name / author / topic_img / region_name / type_names[]
 *   APP 直连 : host = appgb-vdkr.baozimh.com 等，path = /baozimhapp + 原章节路径
 *             headers: referer=https://app.baozimh.com/  app-id=cn.sts.xiaoyun.ordermeals
 *                      app-version=1.0.31  user-agent=baozimh_android/1.0.31/gb/adset  tsid=<JWT>
 *   图片 CDN : s1.baozicdn.com（官方 App 图源），另有 as*-dpa1-cnhk.baozicdn.com 等节点
 * 说明：网页端点章节常只返回一张"请在 APP 内阅读"提示图；走 APP 直连可拿到完整章节。
 */
(function () {
  'use strict';

  const API_DOMAINS = ['https://cn.baozimh.com', 'https://www.baozimh.com', 'https://tw.baozimh.com', 'https://tw.webmota.com'];
  const BYPASS_HOSTS = ['appgb-vdkr.baozimh.com', 'appgb1-vdkr.baozimh.com', 'appgb2-vdkr.baozimh.com', 'app1.baozimh.com', 'app2.baozimh.com', 'app3.baozimh.com', 'app4.baozimh.com'];
  const APP_HEADERS = {
    'referer': 'https://app.baozimh.com/',
    'app-id': 'cn.sts.xiaoyun.ordermeals',
    'app-version': '1.0.31',
    'device-code': '2c712c6ba4e95a9f4157f94e1794a86c',
    'device-id': 'BE2A.250530.026.F3',
    'user-agent': 'baozimh_android/1.0.31/gb/adset',
    'tsid': 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJGcHFUQW1hTW9IM29EakdvZVRrZXBIbUZCc0h2SGtUVCIsImV4cGlyZSI6MjA3OTQ0MzE2Nywic3RhcnQiOjE3NjQwODMxNjd9.BlLrxNcpA747fEcAZKkExzqipbMXq-vmnZIll4ia1jg',
  };
  const ID_RE = /^[a-z0-9][a-z0-9_-]{1,80}$/;
  const JUNK = /logo|avatar|icon|emoji|placeholder|blank|1x1|banner|advert/i;
  const IMG_ATTRS = ['data-src', 'src', 'data-original'];
  const CDN_HOST = 's1.baozicdn.com';

  function abs(u, base) { try { return new URL(encodeURI(String(u || '')), base || 'https://cn.baozimh.com').href; } catch (_) { return ''; } }
  function txt(n) { return n ? Park.html.text(n).replace(/\s+/g, ' ').trim() : ''; }
  function idOf(path) { const m = /^\/comic\/([a-z0-9][a-z0-9_-]{1,80})\/?$/.exec(String(path || '')); return m ? m[1] : ''; }
  function pickImg(el, base) {
    if (!el) return '';
    const ns = [];
    if (el.getAttribute && el.getAttribute('src')) ns.push(el);
    const i = el.querySelector ? el.querySelector('img') : null; if (i) ns.push(i);
    const a = el.querySelector ? el.querySelector('amp-img') : null; if (a) ns.push(a);
    for (const n of ns) for (const at of IMG_ATTRS) {
      const v = n.getAttribute(at);
      if (v && !/^data:/i.test(v)) { const u = abs(v, base); if (u && !JUNK.test(u)) return u; }
    }
    return '';
  }
  function rewriteCdn(u) {
    try {
      const x = new URL(u);
      if (/bzcdn\.net$|baozicdn\.com$/i.test(x.hostname)) return 'https://' + CDN_HOST + x.pathname;
      return u;
    } catch (_) { return u; }
  }

  async function getJson(ctx, url) {
    const r = await ctx.http.get(url, { headers: { 'referer': 'https://www.baozimh.com/', 'accept': 'application/json' } });
    if (!r.ok) throw Park.error('HTTP', '接口返回 {status}', { params: { status: r.status }, status: r.status });
    try { return JSON.parse(r.body); } catch (_) { throw Park.error('PARSE', '接口不是 JSON'); }
  }
  async function fetchHtml(ctx, url, headers) {
    const r = await ctx.http.get(url, headers ? { headers } : undefined);
    if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
    if (!r.ok) throw Park.error('HTTP', '站点返回 {status}', { params: { status: r.status }, status: r.status });
    if (typeof r.body !== 'string' || !r.body) throw Park.error('PARSE', '页面为空');
    let body = r.body;
    if (body.indexOf('class=\\"') >= 0) body = body.replace(/\\"/g, '"');
    return Park.html.parse(body);
  }

  Park.register({
    key: 'baozimh', name: 'BaoziManga', version: '5.0.0', minAppVersion: '0.9.2', apiVersion: 2,
    type: 'comic', category: 'doujin', language: 'zh-Hans',
    description: '包子漫画（接口 + APP 直连）',
    homepage: 'https://cn.baozimh.com/', domains: ['baozimh.com', 'baozicdn.com', 'bzcdn.net', 'webmota.com'],
    network: { mode: 'auto', origin: 'https://cn.baozimh.com' },
    imageHeaders: { Referer: 'https://www.baozimh.com/' },
    idPattern: '^[a-z0-9][a-z0-9-]{1,80}$',
    linkPatterns: ['baozimh\\.com/comic/([a-z0-9][a-z0-9_-]{1,80})(?:[/?#]|$)'],
    defaultFeed: 'new',
    feeds: [
      { key: 'new', label: '最新上架' },
      { key: 'all', label: '全部作品' },
    ],
    searchHint: '输入漫画名',
    BASE: 'https://cn.baozimh.com',

    async feed(key, req) {
      const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
      const type = key === 'all' ? 'all' : 'new';
      let last = null;
      for (const d of API_DOMAINS) {
        try {
          const q = '/api/bzmhq/amp_comic_list?type=' + type + '&region=all&state=all&filter=*&page=' + page +
            '&limit=36&language=tw&__amp_source_origin=' + encodeURIComponent(d);
          const data = await getJson(this, d + q);
          const list = (data && data.items) || [];
          const items = [];
          for (const it of list) {
            const id = String(it.comic_id || '').trim();
            if (!ID_RE.test(id)) continue;
            items.push({
              id, title: String(it.name || id).slice(0, 200),
              cover: rewriteCdn(abs(it.topic_img || '', d)),
              coverAspect: 0.72, authors: it.author ? [String(it.author)] : [],
              tags: Array.isArray(it.type_names) ? it.type_names.slice(0, 6).map(t => ({ name: String(t), keyword: String(t), filters: {} })) : [],
              mediaKind: 'comic',
            });
          }
          if (items.length) return { items, page, totalPages: page, hasNext: !!data.next };
          last = Park.error('PARSE', '接口返回 0 条');
        } catch (e) { last = e; }
      }
      // 兜底：HTML 列表
      try {
        const doc = await fetchHtml(this, 'https://cn.baozimh.com/list/new');
        const items = [];
        for (const card of doc.querySelectorAll('div.comics-card')) {
          const a = card.querySelector('a[href]');
          let id = '';
          try { id = idOf(new URL(a.getAttribute('href'), 'https://cn.baozimh.com').pathname); } catch (_) {}
          if (!id) continue;
          items.push({ id, title: (txt(card.querySelector('.comics-card__info')) || id).slice(0, 200),
            cover: pickImg(card, 'https://cn.baozimh.com'), coverAspect: 0.72, authors: [], tags: [], mediaKind: 'comic' });
        }
        if (items.length) return { items, page, totalPages: page, hasNext: false };
      } catch (_) {}
      throw last || Park.error('PARSE', '列表获取失败');
    },

    async search(req) {
      const kw = String((req && req.keyword) || '').trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const page = Math.max(1, Math.floor(Number(req.page) || 1));
      for (const d of API_DOMAINS) {
        try {
          const q = '/api/bzmhq/amp_comic_list?type=all&region=all&state=all&filter=*&page=' + page +
            '&limit=36&language=tw&q=' + encodeURIComponent(kw) + '&__amp_source_origin=' + encodeURIComponent(d);
          const data = await getJson(this, d + q);
          const items = ((data && data.items) || []).filter(it => ID_RE.test(String(it.comic_id || ''))).map(it => ({
            id: String(it.comic_id), title: String(it.name || '').slice(0, 200),
            cover: rewriteCdn(abs(it.topic_img || '', d)), coverAspect: 0.72,
            authors: it.author ? [String(it.author)] : [], tags: [], mediaKind: 'comic',
          }));
          if (items.length) return { items, page, totalPages: page, hasNext: !!data.next };
        } catch (_) {}
      }
      return { items: [], page, totalPages: page, hasNext: false };
    },

    async detail(id) {
      id = this.validId(id);
      const doc = await fetchHtml(this, 'https://cn.baozimh.com/comic/' + id);
      const title = txt(doc.querySelector('h1.comics-detail__title')) || txt(doc.querySelector('h1')) || id;
      const author = txt(doc.querySelector('h2.comics-detail__author'));
      const desc = txt(doc.querySelector('.supporting-text'));
      const coverNode = doc.querySelector('.comics-detail__cover') || doc.querySelector('.comics-detail');
      const cover = pickImg(coverNode, 'https://cn.baozimh.com');
      const chapters = [], seen = new Set();
      for (const a of doc.querySelectorAll('.comics-chapters__item, a[href*="section_slot"]')) {
        const href = a.getAttribute('href') || '';
        const s = /[?&]section_slot=(\d+)/.exec(href), c = /[?&]chapter_slot=(\d+)/.exec(href);
        if (!s || !c) continue;
        const cid = s[1] + '_' + c[1];
        if (seen.has(cid)) continue;
        seen.add(cid);
        chapters.push({ id: cid, title: (txt(a) || '第' + c[1] + '话').slice(0, 80) });
        if (chapters.length >= 500) break;
      }
      chapters.sort((a, b) => {
        const pa = a.id.split('_').map(Number), pb = b.id.split('_').map(Number);
        return (pa[0] - pb[0]) || (pa[1] - pb[1]);
      });
      return {
        id, title: title.slice(0, 300), cover, coverAspect: 0.72,
        url: 'https://cn.baozimh.com/comic/' + id,
        authors: author ? [author] : [], description: desc.slice(0, 1500), uploaded: '',
        tags: [], chapters: chapters.length ? chapters : null,
        singleChapterId: chapters.length ? undefined : '0_1', mediaKind: 'comic', related: [],
      };
    },

    async chapter(id, chapterId) {
      id = this.validId(id);
      let cid = String(chapterId || '0_1').trim();
      if (!/^\d{1,4}_\d{1,6}$/.test(cid)) cid = '0_1';
      const path = '/comic/chapter/' + id + '/' + cid + '.html';
      let doc = null, via = '';
      // ① APP 直连（可绕过"仅 APP 内阅读"）
      for (const host of BYPASS_HOSTS) {
        try {
          doc = await fetchHtml(this, 'https://' + host + '/baozimhapp' + path, APP_HEADERS);
          via = host;
          break;
        } catch (_) {}
      }
      // ② 普通网页
      if (!doc) {
        for (const d of API_DOMAINS) {
          try { doc = await fetchHtml(this, d + path); via = d; break; } catch (_) {}
        }
      }
      if (!doc) throw Park.error('NETWORK', '章节页取不到');
      const pages = [], seen = new Set();
      for (const n of doc.querySelectorAll('ul.comic-contain amp-img, ul.comic-contain img, .comic-contain amp-img, .comic-contain img')) {
        let u = '';
        for (const at of IMG_ATTRS) {
          const v = n.getAttribute(at);
          if (v && !/^data:/i.test(v)) { u = abs(v, via.startsWith('http') ? via : 'https://' + via); if (u) break; }
        }
        if (!u || !/^https:\/\//i.test(u) || JUNK.test(u)) continue;
        const fixed = rewriteCdn(u);
        if (seen.has(fixed)) continue;
        seen.add(fixed);
        pages.push({ url: fixed });
      }
      if (pages.length <= 1) {
        throw Park.error('UNSUPPORTED', '这一话只返回 {n} 张图（可能是 APP 专供或已下架）', { params: { n: String(pages.length) } });
      }
      return { pages };
    },

    validId(id) {
      const v = String(id || '').trim().replace(/^\/+/, '');
      if (!ID_RE.test(v)) throw Park.error('NOT_FOUND', '漫画编号无效');
      return v;
    },
  });
})();