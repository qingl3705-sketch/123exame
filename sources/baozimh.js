/* BaoziManga · cn.baozimh.com · apiVersion 2 · v1.0.0
 * 站点专用实现（不是通用模板）——基于真实页面实测：
 *   列表  GET /list/new                    容器 div.comics-card，标题 .comics-card__info
 *   详情  GET /comic/<slug>                标题 h1.comics-detail__title / 作者 h2.comics-detail__author
 *   章节  详情页 .comics-chapters__item 的 href 带 section_slot & chapter_slot
 *   阅读  GET https://cn.twbzmg.com/comic/chapter/<slug>/<section>_<chapter>.html
 *         正文 ul.comic-contain > amp-img，图片在 s2.bzcdn.net / static-tw.baozimh.com
 * 说明：章节列表被站点门控（详情页只暴露少量入口），所以章节数取决于原站公开的部分。
 */
(function () {
  'use strict';

  const BASE = 'https://cn.baozimh.com';
  const READ = 'https://cn.twbzmg.com';
  const ID_RE = /^\/comic\/([a-z0-9][a-z0-9_-]{1,80})\/?$/;
  const JUNK = /logo|avatar|icon|emoji|placeholder|blank|1x1|banner|advert/i;
  const IMG_ATTRS = ['data-src', 'src', 'data-original', 'data-lazy-src'];

  function abs(u) { try { return new URL(String(u || ''), BASE).href; } catch (_) { return ''; } }
  function txt(n) { return n ? Park.html.text(n).replace(/\s+/g, ' ').trim() : ''; }
  function imgOf(el) {
    const img = el && el.querySelector('img');
    if (!img) return '';
    for (const a of IMG_ATTRS) {
      const v = img.getAttribute(a);
      if (v && !/^data:/i.test(v)) { const u = abs(v); if (u && !JUNK.test(u)) return u; }
    }
    return '';
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
    return Park.html.parse(r.body);
  }

  Park.register({
    key: 'baozimh',
    name: 'BaoziManga',
    version: '1.0.0',
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
      const url = BASE + path + (page > 1 ? '?page=' + page : '');
      const doc = await get(this, url);
      const items = [], seen = new Set();
      for (const card of doc.querySelectorAll('div.comics-card')) {
        const a = card.querySelector('a[href]');
        const id = a ? idOf(a.getAttribute('href')) : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const title = txt(card.querySelector('.comics-card__info')) || txt(a) || id;
        items.push({
          id, title: title.slice(0, 200), cover: imgOf(card),
          coverAspect: 0.72, authors: [], tags: [], mediaKind: 'comic',
        });
      }
      if (!items.length) {
        throw Park.error('PARSE', '列表未解析到作品：卡片{cards}个 链接{links}个', {
          params: { cards: String(doc.querySelectorAll('div.comics-card').length), links: String(doc.querySelectorAll('a[href]').length) },
        });
      }
      return { items, page, totalPages: page, hasNext: false };
    },

    async search(req) {
      const kw = String((req && req.keyword) || '').trim();
      if (!kw) return { items: [], page: 1, totalPages: 1, hasNext: false };
      const page = Math.max(1, Math.floor(Number(req.page) || 1));
      const doc = await get(this, BASE + '/search', { q: kw, ...(page > 1 ? { page } : {}) });
      const items = [], seen = new Set();
      for (const card of doc.querySelectorAll('div.comics-card')) {
        const a = card.querySelector('a[href]');
        const id = a ? idOf(a.getAttribute('href')) : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({ id, title: (txt(card.querySelector('.comics-card__info')) || id).slice(0, 200),
          cover: imgOf(card), coverAspect: 0.72, authors: [], tags: [], mediaKind: 'comic' });
      }
      return { items, page, totalPages: page, hasNext: false };
    },

    async detail(id) {
      id = this.validId(id);
      const doc = await get(this, BASE + '/comic/' + id);
      const title = txt(doc.querySelector('h1.comics-detail__title')) || txt(doc.querySelector('h1'));
      if (!title) throw Park.error('PARSE', '详情页未找到标题');
      const author = txt(doc.querySelector('h2.comics-detail__author'));
      const desc = txt(doc.querySelector('.supporting-text'));
      const cover = imgOf(doc.querySelector('.comics-detail__cover') || doc.querySelector('.comics-detail') || doc);
      const tags = [], seenTag = new Set();
      for (const a of doc.querySelectorAll('.comics-detail__tags a, .tag')) {
        const t = txt(a);
        if (t && !seenTag.has(t)) { seenTag.add(t); tags.push({ name: t, keyword: t, filters: {} }); }
      }
      // 章节：href 形如 /user/page_direct?comic_id=x&section_slot=0&chapter_slot=1
      const chapters = [], seenCh = new Set();
      for (const a of doc.querySelectorAll('.comics-chapters__item, a[href*="section_slot"]')) {
        const href = a.getAttribute('href') || '';
        const s = /[?&]section_slot=(\d+)/.exec(href), c = /[?&]chapter_slot=(\d+)/.exec(href);
        if (!s || !c) continue;
        const cid = s[1] + '_' + c[1];
        if (seenCh.has(cid)) continue;
        seenCh.add(cid);
        chapters.push({ id: cid, title: (txt(a) || '第' + c[1] + '话').slice(0, 80) });
        if (chapters.length >= 300) break;
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
      const pages = [];
      for (const node of doc.querySelectorAll('ul.comic-contain img, .comic-contain img, .chapter-main img')) {
        let u = '';
        for (const a of IMG_ATTRS) {
          const v = node.getAttribute(a);
          if (v && !/^data:/i.test(v)) { u = abs(v); if (u && !JUNK.test(u)) break; }
        }
        if (!u) continue;
        if (!/^https:\/\//i.test(u)) continue;
        pages.push({ url: u });
      }
      const uniq = [];
      const seen = new Set();
      for (const p of pages) { if (!seen.has(p.url)) { seen.add(p.url); uniq.push(p); } }
      if (!uniq.length) {
        throw Park.error('UNSUPPORTED', '这一话没有公开图片（原站需要登录或已下架）');
      }
      return { pages: uniq };
    },

    validId(id) {
      const v = String(id || '').trim().replace(/^\/+/, '');
      if (!/^[a-z0-9][a-z0-9_-]{1,80}$/.test(v)) throw Park.error('NOT_FOUND', '漫画编号无效');
      return v;
    },
  });
})();