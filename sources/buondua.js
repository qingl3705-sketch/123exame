/* BuonDu · buondua.com · apiVersion 2
 * 生成：2026-11-18 · 置信度：high（未联网验证，见 tools/probe.mjs）
 * 类型：gallery · type=comic category=gallery
   // TODO(低优先)：确认列表容器与详情图片容器是否命中；未命中时先跑 tools/probe.mjs。
 * 规则：key 必须等于文件名；改脚本必须同时升 version。
 */
(function () {
  'use strict';

const S = {
  "key": "buondua",
  "name": "BuonDu",
  "base": "https://buondua.com",
  "host": "buondua.com",
  "kind": "gallery",
  "type": "comic",
  "category": "gallery",
  "lang": "zh-Hans",
  "vpn": true,
  "conf": "high",
  "searchParam": "s",
  "pageParam": "page",
  "idRe": "^[a-z0-9][a-z0-9-]{2,140}$",
  "linkRe": "buondua\\.com/([a-z0-9][a-z0-9-]{2,140})/?(?:[?#]|$)",
  "aspect": 0.75,
  "listPath": "/",
  "pagePath": "/page/{page}",
  "searchPath": "/"
};

// ── 通用工具 ────────────────────────────────────────────────
const JUNK = /(?:^|[/_.-])(?:avatar|logo|icon|emoji|spinner|loading|placeholder|blank|pixel|1x1|banner|ads?)(?:[/_.-]|$)/i;
const IMG_EXT = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

function abs(u, base) {
  try { return new URL(String(u || ''), base || S.base).href; } catch (_) { return ''; }
}
function sameSite(u) {
  try { const h = new URL(u).hostname; return h === S.host || h.endsWith('.' + S.host); } catch (_) { return false; }
}
function first(doc, sels) {
  for (const s of sels) { const n = doc.querySelector(s); if (n) return n; }
  return null;
}
function all(doc, sels) {
  for (const s of sels) { const ns = Array.from(doc.querySelectorAll(s)); if (ns.length) return ns; }
  return [];
}
function textOf(n) { return n ? Park.html.text(n).trim() : ''; }

// 从 <img> 取真实地址：懒加载属性优先，srcset 兜底
const IMG_ATTRS = ['data-original', 'data-src', 'data-lazy-src', 'data-lazy', 'data-echo',
  'data-url', 'data-image', 'data-actualsrc', 'data-cfsrc', 'src'];
function imgUrl(img, base) {
  if (!img) return '';
  for (const a of IMG_ATTRS) {
    const v = img.getAttribute(a);
    if (v && !/^data:/i.test(v)) {
      const u = abs(v, base);
      if (u && !JUNK.test(u)) return u;
    }
  }
  const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset');
  if (ss) {
    const cand = ss.split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const u = abs(cand, base);
    if (u && !JUNK.test(u)) return u;
  }
  return '';
}
function usableImage(u) {
  return !!u && /^https:\/\//i.test(u) && !JUNK.test(u) && (IMG_EXT.test(u) || /\/[^/]+$/.test(u));
}
function dedupe(list) {
  const seen = new Set(), out = [];
  for (const x of list) { if (x && !seen.has(x)) { seen.add(x); out.push(x); } }
  return out;
}

// ── 网络 ────────────────────────────────────────────────────
async function fetchDoc(ctx, url, params) {
  const r = await ctx.http.get(url, params ? { params } : undefined);
  if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
  if (!r.ok) throw Park.error('HTTP', '站点返回 HTTP {status}', { params: { status: r.status }, status: r.status });
  if (typeof r.body !== 'string') throw Park.error('PARSE', '页面内容无效');
  if (r.body.length > 8 * 1024 * 1024) throw Park.error('PARSE', '页面过大');
  return Park.html.parse(r.body);
}
function listUrl(page) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p === 1) return abs(S.listPath || '/');
  const tpl = S.pagePath || '/page/{page}';
  return abs(tpl.replace('{page}', String(p)).replace('{page1}', String(p - 1)));
}
function searchUrl() { return abs(S.searchPath || '/'); }

// ── 列表 ────────────────────────────────────────────────────
const CARD_SEL = ['article', '.post', '.item', '.card', '.grid-item', '.list-item', '.manga-item',
  '.comics-item', '.book-item', '.thumb', '.entry', '.archive-item', 'li.item', 'li.post'];
const TITLE_SEL = ['h1', 'h2', 'h3', '.title', '.entry-title', '.post-title', '.card-title'];
const DATE_SEL = ['.date', '.entry-date', 'time', '.post-date', '.meta time'];

function idFromHref(href) {
  if (!href) return '';
  let u;
  try { u = new URL(href, S.base); } catch (_) { return ''; }
  if (!sameSite(u.href)) return '';
  const re = new RegExp(S.linkRe);
  const m = re.exec(u.pathname) || re.exec(u.href);
  return m ? m[1] : '';
}

function cards(doc) {
  const out = [];
  for (const el of all(doc, CARD_SEL)) {
    const anchors = Array.from(el.querySelectorAll('a[href]'));
    let id = '', hit = null;
    for (const a of anchors) { id = idFromHref(a.getAttribute('href')); if (id) { hit = a; break; } }
    if (!id || out.some(x => x.id === id)) continue;
    const img = el.querySelector('img');
    const title = textOf(first(el, TITLE_SEL)) || textOf(hit) || id;
    const date = textOf(first(el, DATE_SEL));
    out.push({
      id, title: title.slice(0, 200),
      cover: imgUrl(img, S.base),
      coverAspect: S.aspect || 0.75,
      uploaded: date,
      authors: [], tags: [],
      mediaKind: 'comic',
    });
  }
  if (!out.length) return cardsFromJson(doc);
  return out;
}

// SPA 兜底：扫描内联 JSON（__NEXT_DATA__ / application/json / window.__NUXT__）
function inlineJson(doc) {
  const blobs = [];
  for (const s of Array.from(doc.querySelectorAll('script'))) {
    const type = (s.getAttribute('type') || '').toLowerCase();
    const txt = (s.textContent || '').trim();
    if (!txt || txt.length < 200) continue;
    if (s.id === '__NEXT_DATA__' || type === 'application/json' || /^window\.__/.test(txt)) {
      try { blobs.push(JSON.parse(txt)); } catch (_) { /* nuxt 可能不是纯 JSON */ }
    }
  }
  return blobs;
}
function walk(node, visit, depth) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) { for (const x of node.slice(0, 400)) walk(x, visit, depth + 1); return; }
  if (typeof node === 'object') {
    visit(node);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') walk(v, visit, depth + 1);
    }
  }
}
function cardsFromJson(doc) {
  const out = [];
  for (const blob of inlineJson(doc)) {
    walk(blob, (o) => {
      const s = o.slug || o.id || o.comic_id || o.album_id;
      const t = o.title || o.name || o.comic_name;
      if (!s || !t || typeof t !== 'string') return;
      const id = String(s);
      if (!new RegExp(S.linkRe || '^[A-Za-z0-9_-]+$').test(id) && !new RegExp(S.idRe || '^.+$').test(id)) return;
      if (out.some(x => x.id === id)) return;
      const cover = abs(o.thumbnail || o.cover || o.cover_url || o.thumb || '', S.base);
      out.push({ id, title: t.slice(0, 200), cover: usableImage(cover) ? cover : '',
        coverAspect: S.aspect || 0.75, authors: [], tags: [], mediaKind: 'comic' });
    }, 0);
  }
  return out.slice(0, 60);
}

function pagination(doc, page) {
  let totalPages = page;
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const h = a.getAttribute('href') || '';
    const m = /(?:[?&](?:page|paged|p)=|\/page\/)(\d{1,5})/.exec(h);
    if (m) totalPages = Math.max(totalPages, Number(m[1]));
  }
  const next = first(doc, ['a.next', 'a[rel="next"]', '.next a', '.pagination a.next', 'a[aria-label="Next"]']);
  return { page, totalPages, hasNext: page < totalPages || !!next };
}

async function runListing(ctx, url, params, page) {
  const doc = await fetchDoc(ctx, url, params);
  const items = cards(doc);
  if (!items.length) ctx.log({ code: 'UPSTREAM_EMPTY', action: 'list' });
  return { items, ...pagination(doc, page) };
}

// ── 详情 ────────────────────────────────────────────────────
const DESC_SEL = ['.entry-content p', '.post-content p', 'article p', '.desc', '.summary', '#description'];
const AUTHOR_SEL = ['.author a', '[rel="author"]', '.post-author a', '.artist a'];
const TAG_SEL = ['a[rel="tag"]', '.tags a', '.tag-list a', '.entry-tags a', '.post-tags a'];

function metaContent(doc, sel) {
  const n = doc.querySelector(sel);
  return n ? (n.getAttribute('content') || '') : '';
}

async function detailImpl(ctx, id) {
  const url = abs((S.workPrefix || '/') + id + (S.workSuffix || ''));
  const doc = await fetchDoc(ctx, url);
  const title = textOf(first(doc, ['h1', 'h2.entry-title', '.post-title', '.title']))
    || metaContent(doc, 'meta[property="og:title"]') || metaContent(doc, 'meta[name="twitter:title"]');
  if (!title) throw Park.error('NOT_FOUND', '内容不存在');

  const cover = imgUrl(first(doc, ['.entry-content img', 'article img', '.post-content img', 'img.cover']), S.base)
    || abs(metaContent(doc, 'meta[property="og:image"]'), S.base);

  const authors = [];
  for (const n of all(doc, AUTHOR_SEL)) { const t = textOf(n); if (t && !authors.includes(t)) authors.push(t); }

  const tags = [];
  for (const n of all(doc, TAG_SEL)) { const t = textOf(n); if (t) tags.push({ name: t, keyword: t, filters: {} }); }

  let description = '';
  for (const n of all(doc, DESC_SEL)) { const t = textOf(n); if (t.length > description.length) description = t; }
  if (!description) description = metaContent(doc, 'meta[name="description"]');

  const chapters = chapterList(doc);
  const date = textOf(first(doc, DATE_SEL));

  return {
    id, title: title.slice(0, 300), cover, coverAspect: S.aspect || 0.75,
    url, authors, description: description.slice(0, 2000), uploaded: date,
    tags: tags.length ? [{ namespace: 'tag', label: '标签', tags }] : [],
    chapters, singleChapterId: chapters ? undefined : '_',
    mediaKind: 'comic', related: [],
  };
}

function chapterList(doc) {
  if (S.kind !== 'manga') return null;
  const hints = S.chapterHint || ['#chapter-list a', '.chapter-list a', 'a[href*="chapter"]'];
  const nodes = all(doc, hints);
  const out = [];
  for (const a of nodes) {
    const href = a.getAttribute('href') || '';
    const u = abs(href, S.base);
    if (!u || !sameSite(u)) continue;
    const key = new URL(u).pathname;
    if (out.some(x => x.id === key)) continue;
    const t = textOf(a) || key.split('/').filter(Boolean).pop() || key;
    out.push({ id: key, title: t.slice(0, 120) });
    if (out.length >= 500) break;
  }
  return out.length ? out : null;
}

// ── 章节图片 ────────────────────────────────────────────────
const READER_SEL = ['.entry-content', '.post-content', '.gallery', '.reader', '#content',
  '.chapter-content', '.comic-content', 'article', 'main'];

function imagesFromDoc(doc, base) {
  const out = [];
  let scope = first(doc, READER_SEL) || doc;
  for (const img of Array.from(scope.querySelectorAll('img'))) {
    const u = imgUrl(img, base);
    if (!usableImage(u)) continue;
    const w = Number(img.getAttribute('width') || 0);
    const h = Number(img.getAttribute('height') || 0);
    if (w && w < 180 && h && h < 180) continue;
    out.push(u);
  }
  if (out.length < 2) {
    for (const blob of inlineJson(doc)) {
      walk(blob, (o) => {
        for (const k of ['url', 'src', 'image', 'img', 'pic', 'path', 'original']) {
          const v = o[k];
          if (typeof v === 'string' && /^https:\/\//i.test(v)) {
            const u = abs(v, base);
            if (usableImage(u)) out.push(u);
          }
        }
      }, 0);
    }
  }
  return dedupe(out);
}

async function chapterImpl(ctx, id, chapterId) {
  let url;
  if (typeof chapterId === 'string' && chapterId.startsWith('/')) url = abs(chapterId);
  else if (S.chapterAsPath && chapterId) url = abs('/' + String(chapterId).replace(/^\/+/, ''));
  else if (S.chapterPath && chapterId) url = abs(S.chapterPath.replace('{id}', id).replace('{cid}', String(chapterId)));
  else url = abs((S.workPrefix || '/') + id + (S.workSuffix || ''));

  if (!sameSite(url)) throw Park.error('CONFIG', '章节地址不属于本站');
  const doc = await fetchDoc(ctx, url);
  const pages = imagesFromDoc(doc, S.base).map(u => ({ url: u }));
  if (!pages.length) throw Park.error('PARSE', '未解析到图片，站点结构可能已改版');
  return { pages };
}


  Park.register({
    key: "buondua",
    name: "BuonDu",
    version: '0.0.1',
    minAppVersion: '0.9.2',
    type: "comic",
    category: "gallery",
    color: "#6366F1",
    language: "zh-Hans",
    description: "BuonDu（自定义源）",
    homepage: "https://buondua.com",
    domains: ["buondua.com"],
    network: { mode: 'auto', origin: "https://buondua.com", vpnHint: true },
    imageHeaders: { Referer: "https://buondua.com/" },
    idPattern: "^[a-z0-9][a-z0-9-]{2,140}$",
    linkPatterns: ["buondua\\.com/([a-z0-9][a-z0-9-]{2,140})/?(?:[?#]|$)"],
    defaultFeed: 'latest',
    feeds: [{ key: 'latest', label: '最新' }],
    searchHint: '输入关键词',
    BASE: "https://buondua.com",

    async feed(key, req) {
      const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
      return runListing(this, listUrl(page), null, page);
    },

    async search(req) {
      const keyword = String((req && req.keyword) || '').trim();
      if (!keyword) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const page = Math.max(1, Math.floor(Number(req.page) || 1));
      const params = { [S.searchParam]: keyword };
      if (page > 1) params[S.pageParam] = page;
      return runListing(this, searchUrl(), params, page);
    },

    async detail(id) {
      if (!new RegExp(S.idRe).test(String(id))) throw Park.error('NOT_FOUND', '内容编号无效');
      return detailImpl(this, String(id));
    },

    async chapter(id, chapterId) {
      return chapterImpl(this, String(id), chapterId);
    },

    validId(id) {
      const v = String(id).trim();
      if (!new RegExp(S.idRe).test(v)) throw Park.error('NOT_FOUND', '内容编号无效');
      return v;
    },
  });
})();
