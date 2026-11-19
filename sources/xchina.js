/* XChina · xchina.co · v3.0.0 · apiVersion 2
 * 依据你保存的真实页面（164KB / 294 链接）实测：
 *   卡片：a.group.block（首页共 69 个：photo 36 / video 24 / series 9）
 *   作品：/photo/<slug>   ← 是 slug，不是数字（我上一版写错了）
 *   封面：span.ph > img.transition-transform 的 src（普通 src，无懒加载属性）
 * 说明：本机访问 xchina 被 Cloudflare 拦（403 Attention Required），详情页/阅读页结构暂无法实测。
 */
(function () {
  'use strict';

  const BASE = 'https://xchina.co';
  const HOST = 'xchina.co';
  const LINK_RE = 'xchina\\.co/photo/([a-z0-9][a-z0-9-]{2,})';
  const ID_RE = /^[a-z0-9][a-z0-9-]{2,}$/;
  const JUNK = /avatar|logo|icon|emoji|placeholder|blank|1x1|banner|ads?|sprite/i;
  const IMG_ATTRS = ['data-src', 'data-original', 'src'];

  function abs(u, base) { try { return new URL(encodeURI(String(u || '')), base || BASE).href; } catch (_) { return ''; } }
  function txt(n) { return n ? Park.html.text(n).replace(/\s+/g, ' ').trim() : ''; }
  function idOf(href) {
    try {
      const u = new URL(String(href || ''), BASE);
      if (!u.hostname.endsWith(HOST)) return '';
      const m = new RegExp(LINK_RE).exec(u.href);
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }
  function imgOf(el, base) {
    if (!el) return '';
    const nodes = [];
    if (el.getAttribute && el.getAttribute('src')) nodes.push(el);
    const i1 = el.querySelector ? el.querySelector('img') : null;
    if (i1) nodes.push(i1);
    const i2 = el.querySelector ? el.querySelector('amp-img') : null;
    if (i2) nodes.push(i2);
    for (const n of nodes) {
      for (const a of IMG_ATTRS) {
        const v = n.getAttribute(a);
        if (v && !/^data:/i.test(v)) { const u = abs(v, base); if (u && !JUNK.test(u)) return u; }
      }
    }
    return '';
  }
  async function get(ctx, url, params) {
    const r = await ctx.http.get(url, params && Object.keys(params).length ? { params } : {});
    if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
    if (!r.ok) throw Park.error('HTTP', '站点返回 HTTP {status}', { params: { status: r.status }, status: r.status });
    if (typeof r.body !== 'string' || !r.body) throw Park.error('PARSE', '页面内容为空');
    return Park.html.parse(r.body);
  }
  function cardsOf(doc, base) {
    const out = [], seen = new Set();
    for (const card of doc.querySelectorAll('a.group.block')) {
      const id = idOf(card.getAttribute('href'));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const title = txt(card) || id;
      out.push({ id, title: title.slice(0, 200), cover: imgOf(card, base),
        coverAspect: 0.75, authors: [], tags: [], mediaKind: 'comic' });
    }
    return out;
  }

  Park.register({
    key: 'xchina', name: 'XChina', version: '3.0.0', minAppVersion: '0.9.2', apiVersion: 2,
    type: 'comic', category: 'gallery', language: 'zh-Hans',
    description: 'XChina（图集，真实 DOM 实测）',
    homepage: BASE + '/', domains: [HOST],
    network: { mode: 'auto', origin: BASE },
    imageHeaders: { Referer: BASE + '/' },
    idPattern: '^[a-z0-9][a-z0-9-]{2,}$',
    linkPatterns: [LINK_RE],
    defaultFeed: 'new',
    feeds: [{ key: 'new', label: '首页' }],
    searchHint: '输入关键词',
    BASE,

    async feed(key, req) {
      const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
      const url = BASE + '/' + (page > 1 ? '?page=' + page : '');
      const doc = await get(this, url);
      const items = cardsOf(doc, BASE);
      if (!items.length) {
        throw Park.error('PARSE', '列表未解析：卡片{cards} 链接{links}', {
          params: { cards: String(doc.querySelectorAll('a.group.block').length), links: String(doc.querySelectorAll('a[href]').length) },
        });
      }
      return { items, page, totalPages: page, hasNext: false };
    },

    async search(req) {
      const kw = String((req && req.keyword) || '').trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const doc = await get(this, BASE + '/search', { q: kw });
      return { items: cardsOf(doc, BASE), page: 1, totalPages: 1, hasNext: false };
    },

    async detail(id) {
      id = this.validId(id);
      const url = BASE + '/photo/' + id;
      const doc = await get(this, url);
      const title = txt(doc.querySelector('h1')) || txt(doc.querySelector('meta[property="og:title"]')) || id;
      const scopes = ['article', 'main', '.photo-content', '.entry-content', 'figure'];
      let imgs = [];
      for (const s of scopes) {
        const scope = doc.querySelector(s);
        if (!scope) continue;
        const list = [];
        for (const n of scope.querySelectorAll('img')) {
          for (const a of IMG_ATTRS) {
            const v = n.getAttribute(a);
            if (!v || /^data:/i.test(v)) continue;
            const u = abs(v, url);
            if (u && /^https:\/\//i.test(u) && !JUNK.test(u)) { list.push(u); break; }
          }
        }
        if (list.length) { imgs = [...new Set(list)]; break; }
      }
      return {
        id, title: title.slice(0, 300), cover: imgs[0] || '',
        coverAspect: 0.75, url, authors: [], description: '',
        tags: [], chapters: null, singleChapterId: '_',
        mediaKind: 'comic', related: [],
      };
    },

    async chapter(id, chapterId) {
      id = this.validId(id);
      const url = BASE + '/photo/' + id;
      const doc = await get(this, url);
      const pages = [];
      for (const s of ['article', 'main', '.photo-content', '.entry-content', 'figure']) {
        const scope = doc.querySelector(s);
        if (!scope) continue;
        for (const n of scope.querySelectorAll('img')) {
          for (const a of IMG_ATTRS) {
            const v = n.getAttribute(a);
            if (!v || /^data:/i.test(v)) continue;
            const u = abs(v, url);
            if (!u || !/^https:\/\//i.test(u) || JUNK.test(u)) continue;
            if (!pages.some(p => p.url === u)) pages.push({ url: u });
            break;
          }
        }
        if (pages.length) break;
      }
      if (!pages.length) throw Park.error('UNSUPPORTED', '详情页没有解析到图片（该站详情结构待实测）');
      return { pages };
    },

    validId(id) {
      const v = String(id || '').trim().replace(/^\/+/, '').replace(/^photo\//, '');
      if (!ID_RE.test(v)) throw Park.error('NOT_FOUND', '作品编号无效');
      return v;
    },
  });
})();
