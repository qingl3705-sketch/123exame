/* BiliManga · bilimanga.net · v2.0.0 · apiVersion 2
 * feeds: home=首页最新 / week=周人气 / month=月人气
 * 依据真浏览器实测：cardSel=li.module-slide-li · detail=h1.book-title, h1
 */
(function () {
  'use strict';

const S = {
  "key": "bilimanga",
  "name": "BiliManga",
  "base": "https://www.bilimanga.net",
  "host": "bilimanga.net",
  "type": "comic",
  "category": "doujin",
  "lang": "zh-Hans",
  "cardSel": "li.module-slide-li",
  "titleSel": ".module-slide-caption, .module-slide-a",
  "detailTitle": "h1.book-title, h1",
  "descSel": ".book-summary, .content p",
  "feeds": [
    {
      "key": "home",
      "label": "首页最新",
      "path": "/",
      "pageTpl": "/page/{page}"
    },
    {
      "key": "week",
      "label": "周人气",
      "path": "/topfull/weekvote/1.html",
      "pageTpl": "/topfull/weekvote/{page}.html"
    },
    {
      "key": "month",
      "label": "月人气",
      "path": "/top/monthvisit/1.html",
      "pageTpl": "/top/monthvisit/{page}.html"
    }
  ],
  "search": {
    "path": "/",
    "param": "s"
  },
  "linkRe": "bilimanga\\.net/detail/([a-z0-9_-]{1,120})(?:\\.html)?",
  "idRe": "^[a-z0-9_-]{1,120}$",
  "workPath": "/detail/{id}.html",
  "kind": "manga"
};
const JUNK = /(?:^|[/_.-])(?:avatar|logo|icon|emoji|spinner|placeholder|blank|pixel|1x1|banner|ads?)(?:[/_.-]|$)/i;
const IMG_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-echo', 'src'];

function abs(u, base) { try { return new URL(String(u || ''), base || S.base).href; } catch (_) { return ''; } }
function hostOk(u) { try { const h = new URL(u).hostname; return h === S.host || h.endsWith('.' + S.host); } catch (_) { return false; } }
function txt(n) { return n ? Park.html.text(n).replace(/\s+/g, ' ').trim() : ''; }
function imgOf(el, base) {
  if (!el) return '';
  for (const n of [el, ...el.querySelectorAll('img, amp-img')]) {
    if (!n.getAttribute) continue;
    for (const a of IMG_ATTRS) {
      const v = n.getAttribute(a);
      if (v && !/^data:/i.test(v)) { const u = abs(v, base); if (u && !JUNK.test(u)) return u; }
    }
  }
  return '';
}
function idOf(href) {
  try {
    const u = new URL(String(href || ''), S.base);
    if (!hostOk(u.href)) return '';
    const m = new RegExp(S.linkRe).exec(u.href);
    if (!m) return '';
    return m[1].replace(/\/+$/, '');
  } catch (_) { return ''; }
}
function pageUrl(feed, page) {
  const tpl = (page <= 1 && feed.path) ? feed.path : (feed.pageTpl || feed.path);
  return abs(tpl.replace('{page}', String(page)));
}
async function get(ctx, url, params) {
  const r = await ctx.http.get(url, params && Object.keys(params).length ? { params } : {});
  if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
  if (!r.ok) throw Park.error('HTTP', '站点返回 HTTP {status}', { params: { status: r.status }, status: r.status });
  if (typeof r.body !== 'string' || !r.body) throw Park.error('PARSE', '页面内容为空');
  let body = r.body;
  if (body.indexOf('class=\\"') >= 0) body = body.replace(/\\"/g, '"');
  return Park.html.parse(body);
}
function cards(doc) {
  const out = [], seen = new Set();
  for (const el of doc.querySelectorAll(S.cardSel)) {
    const a = (el.tagName && el.tagName.toLowerCase() === 'a') ? el : el.querySelector('a[href]');
    const id = a ? idOf(a.getAttribute('href')) : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = (S.titleSel && txt(el.querySelector(S.titleSel))) || txt(a) || id;
    out.push({ id, title: title.slice(0, 200), cover: imgOf(el, S.base),
      coverAspect: S.aspect || 0.72, authors: [], tags: [], mediaKind: 'comic' });
  }
  return out;
}

Park.register({
  key: S.key, name: S.name, version: '2.0.0', minAppVersion: '0.9.2', apiVersion: 2,
  type: S.type, category: S.category, language: S.lang,
  description: S.name + '（多标签：最新/榜单）',
  homepage: S.base + '/', domains: [S.host],
  network: { mode: 'auto', origin: S.base },
  imageHeaders: { Referer: S.base + '/' },
  idPattern: S.idRe, linkPatterns: [S.linkRe],
  defaultFeed: S.feeds[0].key,
  feeds: S.feeds.map(f => ({ key: f.key, label: f.label })),
  searchHint: '输入关键词',
  BASE: S.base,

  async feed(key, req) {
    const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
    const feed = S.feeds.find(f => f.key === key) || S.feeds[0];
    const doc = await get(this, pageUrl(feed, page));
    const items = cards(doc);
    if (!items.length) {
      throw Park.error('PARSE', '列表未解析：卡片{cards} 链接{links}', {
        params: { cards: String(doc.querySelectorAll(S.cardSel).length), links: String(doc.querySelectorAll('a[href]').length) },
      });
    }
    return { items, page, totalPages: page, hasNext: false };
  },

  async search(req) {
    const kw = String((req && req.keyword) || '').trim();
    if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
    const page = Math.max(1, Math.floor(Number(req.page) || 1));
    const params = { [S.search.param]: kw };
    if (page > 1) params.page = page;
    const doc = await get(this, abs(S.search.path), params);
    return { items: cards(doc), page, totalPages: page, hasNext: false };
  },

  async detail(id) {
    id = this.validId(id);
    const doc = await get(this, abs((S.workPath || '/{id}').replace('{id}', id)));
    const title = txt(doc.querySelector(S.detailTitle)) || txt(doc.querySelector('h1')) || id;
    const cover = imgOf(doc.querySelector('article, .entry-content, .content, main'), S.base);
    const desc = txt(doc.querySelector(S.descSel));
    const tags = [], seen = new Set();
    for (const a of doc.querySelectorAll('a[rel="tag"], .tags a, .tag')) {
      const t = txt(a); if (t && !seen.has(t)) { seen.add(t); tags.push({ name: t, keyword: t, filters: {} }); }
      if (tags.length >= 30) break;
    }
    let chapters = null;
    if (S.kind === 'manga') {
      const list = [], seen2 = new Set();
      for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        const u = abs(href, S.base);
        if (!u || !hostOk(u)) continue;
        const p = new URL(u).pathname;
        if (!/[\/_-](chapter|c|ep|comic)[\/_-]|\/\d{1,5}\/?$|\d+-\d+\.html$/i.test(p)) continue;
        if (p.indexOf(id) < 0 && p.length < 8) continue;
        if (seen2.has(p)) continue;
        seen2.add(p);
        list.push({ id: p, title: (txt(a) || p.split('/').filter(Boolean).pop() || '').slice(0, 80) });
        if (list.length >= 400) break;
      }
      chapters = list.length ? list : null;
    }
    return {
      id, title: title.slice(0, 300), cover, coverAspect: S.aspect || 0.72,
      url: abs((S.workPath || '/{id}').replace('{id}', id)),
      authors: [], description: desc.slice(0, 1500), uploaded: '',
      tags: tags.length ? [{ namespace: 'tag', label: '标签', tags }] : [],
      chapters, singleChapterId: chapters ? undefined : '_',
      mediaKind: 'comic', related: [],
    };
  },

  async chapter(id, chapterId) {
    id = this.validId(id);
    const url = (typeof chapterId === 'string' && chapterId.charAt(0) === '/')
      ? abs(chapterId)
      : abs((S.workPath || '/{id}').replace('{id}', id));
    if (!hostOk(url)) throw Park.error('CONFIG', '章节地址不属于本站');
    const doc = await get(this, url);
    const pages = [], seen = new Set();
    const scope = doc; // 整页扫图，靠 JUNK 过滤与尺寸过滤排干扰
    for (const n of scope.querySelectorAll('img, amp-img')) {
      for (const a of IMG_ATTRS) {
        const v = n.getAttribute(a);
        if (!v || /^data:/i.test(v)) continue;
        const u = abs(v, S.base);
        if (!u || !/^https:\/\//i.test(u) || JUNK.test(u)) continue;
        if (seen.has(u)) break;
        seen.add(u);
        pages.push({ url: u });
        break;
      }
    }
    if (!pages.length) throw Park.error('PARSE', '阅读页未解析到图片');
    return { pages };
  },

  validId(id) {
    let v = String(id || '').trim();
    while (v.charAt(0) === '/') v = v.slice(1);
    if (!v || v.length > 300) throw Park.error('NOT_FOUND', '作品编号无效');
    return v;
  },
});

})();
