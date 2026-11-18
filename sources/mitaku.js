/* Mitaku · mitaku.net · apiVersion 2 · v0.1.0
 * 识别方式：锚点聚类（不依赖固定 CSS 选择器），linkRe = ^/([a-z0-9-]{2,24}/[a-z0-9][a-z0-9-]{2,120})/?$
 * 置信度：high  
 */
(function () {
  'use strict';

const S = {
  "key": "mitaku",
  "name": "Mitaku",
  "base": "https://mitaku.net",
  "host": "mitaku.net",
  "type": "comic",
  "category": "gallery",
  "lang": "zh-Hans",
  "linkRe": "^/([a-z0-9-]{2,24}/[a-z0-9][a-z0-9-]{2,120})/?$",
  "exclude": [
    "tag",
    "author",
    "category",
    "page",
    "search",
    "wp-admin",
    "feed",
    "comment"
  ],
  "listPath": "/",
  "pagePath": "/page/{page}",
  "search": [
    [
      "/",
      "s"
    ]
  ]
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

// ── 作品链接识别 ──
function matchId(href) {
  let u;
  try { u = new URL(String(href || ''), S.base); } catch (_) { return ''; }
  if (!hostOk(u.href)) return '';
  const p = u.pathname;
  if (S.exclude) { const first = p.split('/').filter(Boolean)[0]; if (first && S.exclude.includes(first)) return ''; }
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
// 宽松兜底：linkRe 没命中时，按"路径浅 + 非导航段"找候选作品链接
const NAV = ['search','tag','tags','category','categories','author','page','login','signup','register','about',
  'contact','dmca','privacy','terms','rss','feed','wp-admin','wp-login','comment','comments','user','users',
  'cart','shop','donate','advertise','faq','help','sitemap','video','videos','photo','photos','gallery','genres'];
function seedsLoose(doc) {
  const out = [], seen = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.getAttribute('href') || '', S.base); } catch (_) { continue; }
    if (!hostOk(u.href)) continue;
    const p = u.pathname.replace(/\/+$/, '');
    if (!p || p === '') continue;
    const segs = p.split('/').filter(Boolean);
    if (segs.length > 3) continue;
    if (NAV.includes(segs[0])) continue;
    if (/\.(?:css|js|png|jpe?g|webp|gif|ico|xml|txt)$/i.test(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ id: p.replace(/^\//, ''), a });
    if (out.length > 400) break;
  }
  return out;
}
function signature(el) {
  const cls = ((el.getAttribute && el.getAttribute('class')) || '').trim().split(/\s+/)[0];
  return (el.tagName || '?').toLowerCase() + (cls ? '.' + cls : '');
}
// 锚点聚类：谁的子元素里装的作品链接最多，谁就是卡片
function clusterCards(doc, list) {
  if (!list.length) return [];
  const stats = new Map();
  for (const s of list) {
    let el = s.a;
    for (let d = 0; d < 5 && el; d++) {
      const k = signature(el);
      const st = stats.get(k) || { key: k, ids: new Set(), count: 0 };
      if (!st.ids.has(s.id)) { st.ids.add(s.id); st.count++; }
      stats.set(k, st);
      el = el.parentElement;
    }
  }
  const ranked = [...stats.values()]
    .filter(st => st.count >= 3 && !/^(a|span|img|path|svg)([.\s]|$)/.test(st.key))
    .sort((a, b) => b.count - a.count);
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
  let title = textOf(a);
  if (!title) { const h = el.querySelector('h1,h2,h3,h4'); title = textOf(h); }
  if (!title) title = id;
  const img = el.querySelector('img');
  return { id, title: title.slice(0, 200), cover: imgUrl(img, base), coverAspect: S.aspect || 0.75,
    authors: [], tags: [], mediaKind: 'comic' };
}

// ── 网络 ──
async function doc(url, params) {
  const r = await this.http.get(url, params ? { params } : undefined);
  if (r.status === 404) throw Park.error('NOT_FOUND', '页面不存在');
  if (!r.ok) throw Park.error('HTTP', '站点返回 HTTP {status}', { params: { status: r.status }, status: r.status });
  if (typeof r.body !== 'string') throw Park.error('PARSE', '页面内容无效');
  if (r.body.length > 9 * 1024 * 1024) throw Park.error('PARSE', '页面过大');
  return Park.html.parse(r.body);
}
function listUrl(page) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p === 1 || S.paginate === false) return abs(S.listPath || '/');
  return abs((S.pagePath || '/page/{page}').replace('{page}', String(p)));
}
async function runList(ctx, url, params, page) {
  const d = await doc.call(ctx, url, params);
  let list = seeds(d);
  if (list.length < 3 && S.loose !== false) list = seedsLoose(d);
  const cards = clusterCards(d, list);
  const items = cards.map(c => cardFields(c, S.base));
  if (!items.length) {
    const sigs = [...new Set(list.map(s => signature(s.a.parentElement || s.a)))].slice(0, 4).join(',');
    throw Park.error('PARSE', '结构未识别：链接{hit}个/卡片{cards}张/父元素[{sigs}]',
      { params: { hit: String(list.length), cards: String(cards.length), sigs: sigs || '-' } });
  }
  return { items, page, totalPages: page, hasNext: false };
}

// ── 详情与图片 ──
function contentImages(d, base) {
  // 先把"含有作品链接的祖先"标记掉，剔除推荐位里的图
  const bad = new Set();
  for (const s of seeds(d)) {
    let el = s.a;
    for (let i = 0; i < 3 && el; i++) { bad.add(el); el = el.parentElement; }
  }
  const out = [];
  for (const img of d.querySelectorAll('img')) {
    let anc = img.parentElement, skip = false;
    for (let i = 0; i < 5 && anc; i++) {
      if (bad.has(anc)) { skip = true; break; }
      anc = anc.parentElement;
    }
    if (skip) continue;
    const u = imgUrl(img, base);
    if (!usable(u)) continue;
    const w = Number(img.getAttribute('width') || 0), h = Number(img.getAttribute('height') || 0);
    if (w && w < 200 && h && h < 200) continue;
    out.push(u);
  }
  if (out.length < 2) {
    for (const sel of ['.article-fulltext', '.entry-content', '.post-content', '.reader', '#content', 'article']) {
      const scope = d.querySelector(sel);
      if (!scope) continue;
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
    if (/^\/(?:tag|category|author|search)\//.test(p)) continue;
    if (!/(chapter|episode|read|view|watch|\/\d+)/i.test(p)) continue;
    if (out.some(x => x.id === p)) continue;
    out.push({ id: p, title: (textOf(a) || p.split('/').filter(Boolean).pop() || '').slice(0, 100) });
    if (out.length >= 400) break;
  }
  return out.length ? out : null;
}

async function detailImpl(ctx, id) {
  const d = await doc.call(ctx, workUrl(id));
  const title = textOf(d.querySelector('h1')) || textOf(d.querySelector('h2')) ||
    (d.querySelector('meta[property="og:title"]') || {}).content || '';
  if (!title) throw Park.error('PARSE', '详情页未找到标题');
  const imgs = contentImages(d, S.base);
  const tags = [];
  for (const a of d.querySelectorAll('a[href*="/tag/"], a[rel="tag"]')) {
    const t = textOf(a); if (t) tags.push({ name: t, keyword: t, filters: {} });
    if (tags.length >= 30) break;
  }
  const desc = textOf(d.querySelector('meta[name="description"]') ? d.querySelector('h1') : null);
  return {
    id, title: title.slice(0, 300), cover: imgs[0] || '', coverAspect: S.aspect || 0.75,
    url: workUrl(id), authors: [], tags: tags.length ? [{ namespace: 'tag', label: '标签', tags }] : [],
    description: '', uploaded: '', chapters: chapterList(d, id),
    singleChapterId: chapterList(d, id) ? undefined : '_', mediaKind: 'comic', related: [],
  };
}
async function chapterImpl(ctx, id, chapterId) {
  if (S.noChapter) throw Park.error('UNSUPPORTED', S.noChapter);
  const url = (typeof chapterId === 'string' && chapterId.startsWith('/')) ? abs(chapterId) : workUrl(id);
  if (!hostOk(url)) throw Park.error('CONFIG', '章节地址不属于本站');
  const d = await doc.call(ctx, url);
  const pages = contentImages(d, S.base).map(u => ({ url: u }));
  if (!pages.length) throw Park.error('PARSE', '未解析到图片');
  return { pages };
}


  Park.register({
    key: "mitaku",
    name: "Mitaku",
    version: '0.1.1',
    minAppVersion: '0.9.2',
    apiVersion: 2,
    type: "comic",
    category: "gallery",
    color: "#6366F1",
    language: "zh-Hans",
    description: "Mitaku（自定义源 v0.1.1）",
    homepage: "https://mitaku.net",
    domains: ["mitaku.net"],
    network: { mode: 'auto', origin: "https://mitaku.net" },
    imageHeaders: { Referer: "https://mitaku.net/" },
    idPattern: '^[A-Za-z0-9._/%-]{1,300}$',
    linkPatterns: ["/([a-z0-9-]{2,24}/[a-z0-9][a-z0-9-]{2,120})/?"],
    defaultFeed: 'latest',
    feeds: [{ key: 'latest', label: '最新' }],
    searchHint: '输入关键词',
    BASE: "https://mitaku.net",
    async feed(_key, req) {
      const page = Math.max(1, Math.floor(Number(req && req.page) || 1));
      return runList(this, listUrl(page), null, page);
    },
    async search(req) {
      const kw = String((req && req.keyword) || '').trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const page = Math.max(1, Math.floor(Number(req.page) || 1));
      let last;
      for (const [p, param] of (S.search || [['/', 's']])) {
        try {
          const params = { [param]: kw };
          if (page > 1) params[S.pageParam || 'page'] = page;
          return await runList(this, abs(p), params, page);
        } catch (e) { last = e; }
      }
      throw last || Park.error('PARSE', '搜索失败');
    },
    async detail(id) { return detailImpl(this, this.validId(id)); },
    async chapter(id, chapterId) { return chapterImpl(this, this.validId(id), chapterId); },

    validId(id) {
      let v = String(id || '').trim();
      while (v.charAt(0) === '/') v = v.slice(1);
      const bad = v.length === 0 || v.length > 300 ||
        v.indexOf('?') >= 0 || v.indexOf('#') >= 0 || v.indexOf(' ') >= 0;
      if (bad) throw Park.error('NOT_FOUND', '作品编号无效');
      return v;
    },
  });
})();
