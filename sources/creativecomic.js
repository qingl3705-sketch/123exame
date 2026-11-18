/* CreativeComic · creative-comic.tw · apiVersion 2 · v0.2.0
 * 识别：锚点聚类 + 多候选列表 + 宽松兜底；linkRe = ^/zh/comic/([A-Za-z0-9_-]{1,60})/?$
 * 网络：browser   置信度：low
 */
(function () {
  'use strict';

const S = {
  "key": "creativecomic",
  "name": "CreativeComic",
  "base": "https://www.creative-comic.tw",
  "host": "creative-comic.tw",
  "type": "comic",
  "category": "doujin",
  "lang": "zh-Hant",
  "linkRe": "^/zh/comic/([A-Za-z0-9_-]{1,60})/?$",
  "lists": [
    "/zh/",
    "/zh/comic"
  ],
  "pagePath": "/zh/?page={page}",
  "search": [
    [
      "/zh/search",
      "q"
    ]
  ],
  "workPath": "/zh/comic/{id}",
  "kind": "manga"
};
const JUNK = /(?:^|[/_.-])(?:avatar|logo|icon|emoji|spinner|loading|placeholder|blank|pixel|1x1|banner|ads?)(?:[/_.-]|$)/i;
const IMG_ATTRS = ['data-original', 'data-src', 'data-lazy-src', 'data-lazy', 'data-echo',
  'data-url', 'data-image', 'data-actualsrc', 'data-cfsrc', 'src'];

function abs(u, base) { try { return new URL(String(u || ''), base || S.base).href; } catch (_) { return ''; } }
function hostOk(u) { try { const h = new URL(u).hostname; return h === S.host || h.endsWith('.' + S.host); } catch (_) { return false; } }
function imgUrl(img, base) {
  if (!img) return '';
  for (const a of IMG_ATTRS) {
    const v = img.getAttribute(a);
    if (v && !/^data:/i.test(v)) { const u = abs(v, base); if (u && !JUNK.test(u)) return u; }
  }
  const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset');
  if (ss) { const c = ss.split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop(); const u = abs(c, base); if (u && !JUNK.test(u)) return u; }
  return '';
}
function usable(u) { return !!u && /^https:\/\//i.test(u) && !JUNK.test(u); }
function textOf(n) { return n ? Park.html.text(n).replace(/\s+/g, ' ').trim() : ''; }

function matchId(href) {
  let u;
  try { u = new URL(String(href || ''), S.base); } catch (_) { return ''; }
  if (!hostOk(u.href)) return '';
  const p = u.pathname;
  if (S.exclude) { const f = p.split('/').filter(Boolean)[0]; if (f && S.exclude.includes(f)) return ''; }
  const m = new RegExp(S.linkRe).exec(p);
  return m && m[1] ? m[1] : '';
}
function seeds(doc) {
  const out = [], seen = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    const id = matchId(a.getAttribute('href'));
    if (!id || seen.has(id)) continue;
    seen.add(id); out.push({ id, a });
  }
  return out;
}
const NAV = ['search','tag','tags','category','categories','author','page','login','signup','register','about',
  'contact','dmca','privacy','terms','rss','feed','wp-admin','wp-login','comment','comments','user','users',
  'cart','shop','donate','advertise','faq','help','sitemap','video','videos','photo','photos','gallery','genres'];
function seedsLoose(doc) {
  const out = [], seen = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.getAttribute('href') || '', S.base); } catch (_) { continue; }
    if (!hostOk(u.href)) continue;
    const p = u.pathname.replace(/\/+$/, '');
    if (!p) continue;
    const segs = p.split('/').filter(Boolean);
    if (segs.length > 3 || NAV.includes(segs[0])) continue;
    if (/\.(?:css|js|png|jpe?g|webp|gif|ico|xml|txt)$/i.test(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p); out.push({ id: p.replace(/^\//, ''), a });
    if (out.length > 400) break;
  }
  return out;
}
function signature(el) {
  if (!el || !el.tagName) return '?';
  const cls = (((el.getAttribute && el.getAttribute('class')) || '').trim().split(/\s+/)[0]);
  return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
}
function clusterCards(doc, list) {
  if (!list.length) return [];
  const stats = new Map();
  for (const s of list) {
    let el = s.a;
    for (let d = 0; d < 5 && el; d++) {
      const k = signature(el);
      const st = stats.get(k) || { key: k, ids: new Set() };
      st.ids.add(s.id); stats.set(k, st);
      el = el.parentElement;
    }
  }
  const ranked = [...stats.values()]
    .filter(st => st.ids.size >= 3 && !/^(a|span|img|path|svg)([.\s]|$)/.test(st.key))
    .sort((a, b) => b.ids.size - a.ids.size);
  for (const best of ranked) {
    const cards = [];
    for (const el of doc.querySelectorAll(best.key)) {
      let id = '';
      for (const a of el.querySelectorAll('a[href]')) { const i = matchId(a.getAttribute('href')); if (i) { id = i; break; } }
      if (!id || cards.some(c => c.id === id)) continue;
      cards.push({ el, id });
    }
    if (cards.length >= 3) return cards;
  }
  return [];
}
function cardFields(card, base) {
  const { el, id } = card;
  const a = [...el.querySelectorAll('a[href]')].find(x => matchId(x.getAttribute('href')) === id);
  let title = textOf(a) || textOf(el.querySelector('h1,h2,h3,h4'));
  if (!title) title = id;
  return { id, title: title.slice(0, 200), cover: imgUrl(el.querySelector('img'), base),
    coverAspect: S.aspect || 0.75, authors: [], tags: [], mediaKind: 'comic' };
}

// 结构摘要：出问题时把这段显示给用户，用来定位真实结构
function tmpl(href) {
  let u; try { u = new URL(href, S.base); } catch (_) { return ''; }
  const p = u.pathname.replace(/\/+$/, '');
  const segs = p.split('/').filter(Boolean).slice(0, 3).map(s =>
    /^\d+$/.test(s) ? ':n' : (/^[a-z][a-z0-9-]{1,20}$/.test(s) ? s : ':s'));
  return '/' + segs.join('/');
}
function summarize(doc, bytes, matched, cards) {
  const anchors = [...doc.querySelectorAll('a[href]')];
  const sh = new Map(); for (const a of anchors) { const t = tmpl(a.getAttribute('href')); if (t) sh.set(t, (sh.get(t) || 0) + 1); }
  const pa = new Map(); for (const a of anchors) { const k = signature(a.parentElement); pa.set(k, (pa.get(k) || 0) + 1); }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => k + '×' + n).join(' ');
  const kb = Math.round(bytes / 1024);
  return '结构未识别：页' + kb + 'KB 锚点' + anchors.length + ' 命中' + matched.length + ' 卡' + cards.length +
    ' | 形态:' + (top(sh) || '-') + ' | 父:' + (top(pa) || '-');
}

async function fetchDoc(ctx, url, params) {
  const r = await ctx.http.get(url, params && Object.keys(params).length ? { params } : {});
  if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
  if (!r.ok) throw Park.error('HTTP', '站点返回 HTTP {status}', { params: { status: r.status }, status: r.status });
  if (typeof r.body !== 'string' || !r.body) throw Park.error('PARSE', '页面内容为空');
  if (r.body.length > 9 * 1024 * 1024) throw Park.error('PARSE', '页面过大');
  return { doc: Park.html.parse(r.body), bytes: r.body.length };
}
function withPage(p, page) {
  const tpl = p.indexOf('{page}') >= 0 ? p : (page > 1 ? (S.pagePath || '/page/{page}') : p);
  return abs(tpl.replace('{page}', String(page)));
}

async function tryLists(ctx, page) {
  const lists = S.lists && S.lists.length ? S.lists : [S.listPath || '/'];
  let first = null;
  for (const lp of lists) {
    const url = withPage(lp, page);
    let got;
    try { got = await fetchDoc(ctx, url); } catch (e) { if (!first) first = { err: e }; continue; }
    const strict = seeds(got.doc);
    let cards = clusterCards(got.doc, strict);
    let used = 'strict';
    if (cards.length < 3) {
      const loose = seedsLoose(got.doc);
      if (loose.length >= 3) { const c2 = clusterCards(got.doc, loose); if (c2.length > cards.length) { cards = c2; used = 'loose'; } }
    }
    if (!first) first = { doc: got.doc, bytes: got.bytes, strict, cards, used };
    if (cards.length >= 3) {
      return { items: cards.map(c => cardFields(c, S.base)), page, totalPages: page, hasNext: false };
    }
  }
  if (first.err) throw first.err;
  throw Park.error('PARSE', summarize(first.doc, first.bytes, first.strict, first.cards));
}

function contentImages(d, base) {
  const bad = new Set();
  for (const s of seeds(d)) { let el = s.a; for (let i = 0; i < 3 && el; i++) { bad.add(el); el = el.parentElement; } }
  const out = [];
  for (const img of d.querySelectorAll('img')) {
    let anc = img.parentElement, skip = false;
    for (let i = 0; i < 5 && anc; i++) { if (bad.has(anc)) { skip = true; break; } anc = anc.parentElement; }
    if (skip) continue;
    const u = imgUrl(img, base);
    if (!usable(u)) continue;
    const w = Number(img.getAttribute('width') || 0), h = Number(img.getAttribute('height') || 0);
    if (w && w < 200 && h && h < 200) continue;
    out.push(u);
  }
  if (out.length < 2) {
    for (const sel of ['.article-fulltext', '.entry-content', '.post-content', '.reader', '#content', 'article']) {
      const scope = d.querySelector(sel); if (!scope) continue;
      for (const img of scope.querySelectorAll('img')) { const u = imgUrl(img, base); if (usable(u)) out.push(u); }
      if (out.length >= 2) break;
    }
  }
  return [...new Set(out)];
}
function workUrl(id) { return abs((S.workPath || '/{id}').replace('{id}', String(id))); }
function chapterList(d, id) {
  if (S.kind !== 'manga' || S.noChapter) return null;
  const work = new URL(workUrl(id)).pathname.replace(/\/$/, '');
  const out = [];
  for (const a of d.querySelectorAll('a[href]')) {
    const u = abs(a.getAttribute('href'), S.base);
    if (!hostOk(u)) continue;
    const p = new URL(u).pathname;
    if (p === work || !p.startsWith(work)) continue;
    if (!/(chapter|episode|read|view|watch|\/\d+)/i.test(p)) continue;
    if (out.some(x => x.id === p)) continue;
    out.push({ id: p, title: (textOf(a) || p.split('/').filter(Boolean).pop() || '').slice(0, 100) });
    if (out.length >= 400) break;
  }
  return out.length ? out : null;
}
async function detailImpl(ctx, id) {
  const got = await fetchDoc(ctx, workUrl(id));
  const d = got.doc;
  const title = textOf(d.querySelector('h1')) || textOf(d.querySelector('h2')) ||
    (d.querySelector('meta[property="og:title"]') || {}).content || '';
  if (!title) throw Park.error('PARSE', summarize(d, got.bytes, seeds(d), []));
  const imgs = contentImages(d, S.base);
  const tags = [];
  for (const a of d.querySelectorAll('a[href*="/tag/"], a[rel="tag"]')) {
    const t = textOf(a); if (t) tags.push({ name: t, keyword: t, filters: {} });
    if (tags.length >= 30) break;
  }
  const chapters = chapterList(d, id);
  return {
    id, title: title.slice(0, 300), cover: imgs[0] || '', coverAspect: S.aspect || 0.75,
    url: workUrl(id), authors: [], tags: tags.length ? [{ namespace: 'tag', label: '标签', tags }] : [],
    description: '', uploaded: '', chapters, singleChapterId: chapters ? undefined : '_',
    mediaKind: 'comic', related: [],
  };
}
async function chapterImpl(ctx, id, chapterId) {
  if (S.noChapter) throw Park.error('UNSUPPORTED', S.noChapter);
  const url = (typeof chapterId === 'string' && chapterId.charAt(0) === '/') ? abs(chapterId) : workUrl(id);
  if (!hostOk(url)) throw Park.error('CONFIG', '章节地址不属于本站');
  const got = await fetchDoc(ctx, url);
  const pages = contentImages(got.doc, S.base).map(u => ({ url: u }));
  if (!pages.length) throw Park.error('PARSE', summarize(got.doc, got.bytes, seeds(got.doc), []));
  return { pages };
}


  Park.register({
    key: "creativecomic",
    name: "CreativeComic",
    version: '0.2.0',
    minAppVersion: '0.9.2',
    apiVersion: 2,
    type: "comic",
    category: "doujin",
    color: "#6366F1",
    language: "zh-Hant",
    description: "CreativeComic（自定义源 v0.2.0）",
    homepage: "https://www.creative-comic.tw",
    domains: ["creative-comic.tw"],
    network: { mode: "browser", origin: "https://www.creative-comic.tw" },
    imageHeaders: { Referer: "https://www.creative-comic.tw/" },
    idPattern: '^[A-Za-z0-9._/%-]{1,300}$',
    linkPatterns: ["/zh/comic/([A-Za-z0-9_-]{1,60})/?"],
    defaultFeed: 'latest',
    feeds: [{ key: 'latest', label: '最新' }],
    searchHint: '输入关键词',
    BASE: "https://www.creative-comic.tw",
    async feed(_key, req) {
      const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
      return tryLists(this, page);
    },
    async search(req) {
      const kw = String((req && req.keyword) || '').trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const page = Math.max(1, Math.floor(Number(req.page) || 1));
      let last;
      for (const pair of (S.search || [['/', 's']])) {
        try {
          const params = { [pair[1]]: kw };
          if (page > 1) params[S.pageParam || 'page'] = page;
          const got = await fetchDoc(this, abs(pair[0]), params);
          const strict = seeds(got.doc);
          let cards = clusterCards(got.doc, strict);
          if (cards.length < 3) { const loose = seedsLoose(got.doc); if (loose.length >= 3) { const c2 = clusterCards(got.doc, loose); if (c2.length > cards.length) cards = c2; } }
          if (cards.length) return { items: cards.map(c => cardFields(c, S.base)), page, totalPages: page, hasNext: false };
          last = Park.error('PARSE', summarize(got.doc, got.bytes, strict, cards));
        } catch (e) { last = e; }
      }
      throw last || Park.error('PARSE', '搜索失败');
    },
    async detail(id) { return detailImpl(this, this.validId(id)); },
    async chapter(id, chapterId) { return chapterImpl(this, this.validId(id), chapterId); },

    validId(id) {
      let v = String(id || '').trim();
      while (v.charAt(0) === '/') v = v.slice(1);
      if (!v || v.length > 300 || v.indexOf('?') >= 0 || v.indexOf('#') >= 0 || v.indexOf(' ') >= 0) {
        throw Park.error('NOT_FOUND', '作品编号无效');
      }
      return v;
    },
  });
})();
