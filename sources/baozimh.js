/* BaoziManga · cn.baozimh.com · apiVersion 2 · v1.3.0
 * 站点专用实现。基于真实页面与**未执行 JS 的原始 HTML** 实测：
 *   列表  GET /list/new               48 × div.comics-card，封面是 <amp-img src>（原 HTML 里没有 <img>）
 *   详情  GET /comic/<slug>           h1.comics-detail__title / h2.comics-detail__author
 *   章节  详情页 .comics-chapters__item 的 href 带 section_slot & chapter_slot
 *   阅读  GET https://cn.twbzmg.com/comic/chapter/<slug>/<section>_<chapter>.html
 *         正文 ul.comic-contain > amp-img.comic-contain__item
 *         图片：src = https://s1-xxx.bzcdn.net/...（可直接加载）
 *               data-src = https://s1.bzcdn.net/...（备用，可能是 404）
 * v1.1.0 修正：① 同时识别 <amp-img>（原来只找 <img>，导致封面空白）
 *              ② 取图优先 src，data-src 作为 fallbacks
 *              ③ 按文件名去重，避免 src/data-src 同一张图重复
 */
(function () {
  'use strict';

  const BASE = 'https://cn.baozimh.com';
  const READ = 'https://cn.twbzmg.com';
  const ID_RE = /^\/comic\/([a-z0-9][a-z0-9_-]{1,80})\/?$/;
  const JUNK = /logo|avatar|icon|emoji|placeholder|blank|1x1|banner|advert/i;

  function abs(u) { try { return new URL(String(u || ''), BASE).href; } catch (_) { return ''; } }
  function txt(n) { return n ? Park.html.text(n).replace(/\s+/g, ' ').trim() : ''; }

  // src 优先，data-src 次之；两个都返回，后者当 fallback
  function pickImg(el) {
    if (!el) return null;
    const nodes = [el, ...el.querySelectorAll('img, amp-img')];
    for (const n of nodes) {
      if (!n.getAttribute) continue;
      let src = n.getAttribute('src') || '';
      let alt = n.getAttribute('data-src') || n.getAttribute('data-original') || '';
      if (/^data:/i.test(src)) src = '';
      if (/^data:/i.test(alt)) alt = '';
      const a = src ? abs(src) : '';
      const b = alt ? abs(alt) : '';
      if (a && !JUNK.test(a) && /^https:\/\//i.test(a)) {
        return { url: a, fallback: (b && b !== a) ? b : '' };
      }
      if (b && !JUNK.test(b) && /^https:\/\//i.test(b)) return { url: b, fallback: '' };
    }
    return null;
  }
  function coverOf(card) { const p = pickImg(card); return p ? coverUrl(p.url) : ''; }

  // 封面：SSR 给的常见是 /cover/<slug>.jpg（实测 404），真实文件是 /cover/<slug>_cover.png
  function coverUrl(raw) {
    if (!raw) return '';
    try {
      const u = new URL(raw, BASE);
      if (!/baozimh\.com$/i.test(u.hostname)) return u.href;
      const m = /^\/cover\/(.+?)(?:_cover)?\.(?:jpe?g|png|webp)$/i.exec(u.pathname);
      if (!m) return u.href;
      return u.origin + '/cover/' + m[1] + '_cover.png';
    } catch (_) { return ''; }
  }
  // 章节图：SSR 给 sN.bzcdn.net（实测 404），真实节点是 sN-dpa1-cnhk.bzcdn.net
  function chapterImage(raw) {
    try {
      const u = new URL(raw, BASE);
      if (!/\.bzcdn\.net$/i.test(u.hostname)) return { url: u.href };
      const node = u.hostname.split('.')[0];
      return {
        url: 'https://' + node + '-dpa1-cnhk.bzcdn.net' + u.pathname,
        fallbacks: ['https://' + node + '-mha1-nlams.bzcdn.net' + u.pathname, u.origin + u.pathname],
      };
    } catch (_) { return null; }
  }

  function idOf(href) {
    try {
      const u = new URL(String(href || ''), BASE);
      if (!u.hostname.endsWith('baozimh.com')) return '';
      const m = ID_RE.exec(u.pathname);
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }
  async function get(ctx, url, params) {
    const r = await ctx.http.get(url, params && Object.keys(params).length ? { params } : {});
    if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
    if (!r.ok) throw Park.error('HTTP', '站点返回 HTTP {status}', { params: { status: r.status }, status: r.status });
    if (typeof r.body !== 'string' || !r.body) throw Park.error('PARSE', '页面内容为空');
    // 该站 SSR 输出会把属性引号转义成 class=\"x\"（AMP+Nuxt 的问题），
    // 浏览器靠水合修正，但插件拿到的是原始字节，必须先反转义，否则 div.comics-card 选不中。
    let body = r.body;
    if (body.indexOf('class=\\"') >= 0) body = body.replace(/\\"/g, '"');
    return Park.html.parse(body);
  }
  function cardsOf(doc) {
    const items = [], seen = new Set();
    for (const card of doc.querySelectorAll('div.comics-card')) {
      const a = card.querySelector('a[href]');
      const id = a ? idOf(a.getAttribute('href')) : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const title = txt(card.querySelector('.comics-card__info')) || txt(a) || id;
      items.push({
        id, title: title.slice(0, 200), cover: coverOf(card),
        coverAspect: 0.72, authors: [], tags: [], mediaKind: 'comic',
      });
    }
    return items;
  }

  Park.register({
    key: 'baozimh',
    name: 'BaoziManga',
    version: '1.3.0',
    minAppVersion: '0.9.2',
    apiVersion: 2,
    type: 'comic',
    category: 'doujin',
    color: '#F59E0B',
    language: 'zh-Hans',
    description: '包子漫画（站点专用实现）',
    homepage: BASE + '/',
    domains: ['baozimh.com', 'twbzmg.com', 'bzcdn.net'],
    network: { mode: 'auto', origin: BASE },
    imageHeaders: { Referer: BASE + '/' },
    idPattern: '^[a-z0-9][a-z0-9_-]{1,80}$',
    linkPatterns: ['baozimh\\.com/comic/([a-z0-9][a-z0-9_-]{1,80})(?:[/?#]|$)'],
    defaultFeed: 'new',
    feeds: [
      { key: 'new', label: '最新上架' },
      { key: 'update', label: '最近更新' },
    ],
    searchHint: '输入漫画名',
    BASE,

    async feed(key, req) {
      const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
      const path = key === 'update' ? '/list/update' : '/list/new';
      const doc = await get(this, BASE + path + (page > 1 ? '?page=' + page : ''));
      const items = cardsOf(doc);
      if (!items.length) {
        throw Park.error('PARSE', '列表未解析到作品：卡片{cards}个 图片{imgs}个', {
          params: {
            cards: String(doc.querySelectorAll('div.comics-card').length),
            imgs: String(doc.querySelectorAll('img, amp-img').length),
          },
        });
      }
      return { items, page, totalPages: page, hasNext: false };
    },

    async search(req) {
      const kw = String((req && req.keyword) || '').trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const page = Math.max(1, Math.floor(Number(req.page) || 1));
      const doc = await get(this, BASE + '/search', { q: kw, ...(page > 1 ? { page } : {}) });
      const items = cardsOf(doc);
      return { items, page, totalPages: page, hasNext: false };
    },

    async detail(id) {
      id = this.validId(id);
      const doc = await get(this, BASE + '/comic/' + id);
      const title = txt(doc.querySelector('h1.comics-detail__title')) || txt(doc.querySelector('h1'));
      if (!title) throw Park.error('PARSE', '详情页未找到标题');
      const author = txt(doc.querySelector('h2.comics-detail__author'));
      const desc = txt(doc.querySelector('.supporting-text'));
      const coverNode = doc.querySelector('.comics-detail__cover') || doc.querySelector('.comics-detail');
      const cover = coverOf(coverNode) || coverOf(doc);
      const tags = [], seenTag = new Set();
      for (const a of doc.querySelectorAll('.comics-detail__tags a, .tag')) {
        const t = txt(a);
        if (t && !seenTag.has(t)) { seenTag.add(t); tags.push({ name: t, keyword: t, filters: {} }); }
      }
      const chapters = [], seenCh = new Set();
      for (const a of doc.querySelectorAll('.comics-chapters__item, a[href*="section_slot"]')) {
        const href = a.getAttribute('href') || '';
        const s = /[?&]section_slot=(\d+)/.exec(href), c = /[?&]chapter_slot=(\d+)/.exec(href);
        if (!s || !c) continue;
        const cid = s[1] + '_' + c[1];
        if (seenCh.has(cid)) continue;
        seenCh.add(cid);
        chapters.push({ id: cid, title: (txt(a) || '第' + c[1] + '话').slice(0, 80) });
        if (chapters.length >= 500) break;
      }
      return {
        id, title: title.slice(0, 300), cover, coverAspect: 0.72,
        url: BASE + '/comic/' + id,
        authors: author ? [author] : [],
        description: desc.slice(0, 1500), uploaded: '',
        tags: tags.length ? [{ namespace: 'tag', label: '标签', tags }] : [],
        chapters: chapters.length ? chapters : null,
        singleChapterId: chapters.length ? undefined : '0_1',
        mediaKind: 'comic', related: [],
      };
    },

    async chapter(id, chapterId) {
      id = this.validId(id);
      let cid = String(chapterId || '0_1').trim();
      if (!/^\d{1,4}_\d{1,6}$/.test(cid)) cid = '0_1';
      const doc = await get(this, READ + '/comic/chapter/' + id + '/' + cid + '.html');
      const nodes = [
        ...doc.querySelectorAll('ul.comic-contain amp-img, ul.comic-contain img'),
        ...doc.querySelectorAll('.comic-contain amp-img, .comic-contain img'),
      ];
      const byName = new Map();
      for (const n of nodes) {
        const p = pickImg(n);
        if (!p) continue;
        const page = chapterImage(p.url);
        if (!page) continue;
        let key;
        try { key = new URL(p.url).pathname; } catch (_) { key = p.url; }
        if (byName.has(key)) continue;
        byName.set(key, page);
      }
      const pages = [...byName.values()];
      if (!pages.length) {
        throw Park.error('PARSE', '阅读页未解析到图片：amp-img{amps}个 img{imgs}个', {
          params: {
            amps: String(doc.querySelectorAll('amp-img').length),
            imgs: String(doc.querySelectorAll('img').length),
          },
        });
      }
      return { pages };
    },

    validId(id) {
      const v = String(id || '').trim().replace(/^\/+/, '');
      if (!/^[a-z0-9][a-z0-9_-]{1,80}$/.test(v)) throw Park.error('NOT_FOUND', '漫画编号无效');
      return v;
    },
  });
})();
