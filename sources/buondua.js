/* BuonDu · buondua.com · v2.1.0 · apiVersion 2
 * feeds: new=最新
 * 正文容器: .article-fulltext .article.content
 */
(function () {
  'use strict';

const S = {
  "key": "buondua",
  "name": "BuonDu",
  "base": "https://buondua.com",
  "host": "buondua.com",
  "type": "comic",
  "category": "gallery",
  "lang": "zh-Hans",
  "cardSel": "div.items-row",
  "titleSel": ".page-header a, .page-header",
  "detailTitle": "h1",
  "descSel": "meta[name=\"description\"]",
  "contentSel": [
    ".article-fulltext",
    ".article.content"
  ],
  "feeds": [
    {
      "key": "new",
      "label": "最新",
      "path": "/",
      "pageTpl": "/"
    }
  ],
  "search": {
    "path": "/",
    "param": "s"
  },
  "linkRe": "buondua\\.com/([a-z0-9][a-z0-9-]{3,}-\\d{3,})/?$",
  "idRe": "^[a-z0-9][a-z0-9-]{3,}-\\d{3,}$",
  "workPath": "/{id}",
  "kind": "gallery"
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
    return m ? m[1].replace(/\/+$/, '') : '';
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
// 只在正文容器里取图；容器都取不到时才退回整页
function contentImgs(doc, base) {
  const sels = (S.contentSel && S.contentSel.length) ? S.contentSel : [];
  for (const sel of sels) {
    const scope = doc.querySelector(sel);
    if (!scope) continue;
    const out = [];
    for (const n of scope.querySelectorAll('img, amp-img')) {
      for (const a of IMG_ATTRS) {
        const v = n.getAttribute(a);
        if (!v || /^data:/i.test(v)) continue;
        const u = abs(v, base);
        if (!u || !/^https:\/\//i.test(u) || JUNK.test(u)) continue;
        out.push(u); break;
      }
    }
    if (out.length) return [...new Set(out)];
  }
  return [];
}

Park.register({
  key: 'buondua', name: 'BuonDu', version: '2.1.0', minAppVersion: '0.9.2', apiVersion: 2,
  type: 'comic', category: 'gallery', language: 'zh-Hans',
  description: 'BuonDu（多标签）',
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
    const url = abs((S.workPath || '/{id}').replace('{id}', id));
    const doc = await get(this, url);
    const title = txt(doc.querySelector(S.detailTitle)) || txt(doc.querySelector('h1')) || id;
    const imgs = contentImgs(doc, S.base);
    const cover = imgs[0] || imgOf(doc.querySelector('article, main'), S.base);
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
        const u = abs(a.getAttribute('href'), S.base);
        if (!u || !hostOk(u)) continue;
        const p = new URL(u).pathname;
        if (!/(chapter|\/c\/|\/read)/i.test(p) && !/\/\d{1,6}\.html$/.test(p)) continue;
        if (seen2.has(p)) continue;
        seen2.add(p);
        list.push({ id: p, title: (txt(a) || p.split('/').filter(Boolean).pop() || '').slice(0, 80) });
        if (list.length >= 400) break;
      }
      chapters = list.length ? list : null;
    }
    return {
      id, title: title.slice(0, 300), cover, coverAspect: S.aspect || 0.72,
      url, authors: [], description: desc.slice(0, 1500), uploaded: '',
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
    const pages = contentImgs(doc, S.base).map(u => ({ url: u }));
    if (!pages.length) {
      throw Park.error('PARSE', '阅读页正文里没有图片（容器{sel}）', {
        params: { sel: (S.contentSel || []).join(' ') || '-' },
      });
    }
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
