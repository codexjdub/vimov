'use strict';

// What the vbar and the address-bar keyword look through: open tabs,
// bookmarks, history and search engines, matched against the typed words and
// ranked together. Runs in the background page, which has the APIs.

const Sources = (() => {
  const MAX_RESULTS = 10;
  // Words that limit a search to one source, as in Firefox's address bar.
  const SYMBOLS = { '*': 'bookmarks', '%': 'tabs', '^': 'history', '?': 'web' };
  // A result ranked at least this high is listed above the web search: a
  // title or site that starts with the words, or, for an open tab or a page
  // used often, a word in the title that does.
  const STRONG = 9;
  // With nothing typed, o lists this many recently used tabs before the most
  // visited sites.
  const RECENT_TABS = 5;
  // Bookmarks and history entries Vimov can open. Bookmarklets (javascript:)
  // and Firefox's place: queries aren't included.
  const OPENABLE = /^https?:\/\//i;
  // Endings that make a single typed word an address rather than a search.
  // Anything with a path or port counts too, so github.com/x and foo.test:8080 do.
  const TLDS = new Set(
    (
      'com org net edu gov mil int io dev app ai co me info biz xyz site online tech cloud page blog wiki news shop store ' +
      'tv gg fm sh so ly to cc uk de fr nl be es it pt ch at se no fi dk pl cz ie eu ru ua jp cn kr tw hk in au nz ca us mx br ar za il'
    ).split(' '),
  );

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let bookmarkCache = null; // Promise of every bookmark and folder, flattened
  const forgetBookmarks = () => {
    bookmarkCache = null;
  };
  for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved']) {
    browser.bookmarks[event].addListener(forgetBookmarks);
  }

  // Bookmarks and folders as one list, each with the path of folders it's in.
  // The top-level folders (menu, toolbar, other) are left out of paths.
  function allBookmarks() {
    bookmarkCache ||= browser.bookmarks.getTree().then(
      ([root]) => {
        const items = [];
        const walk = (node, path) => {
          for (const child of node.children || []) {
            if (child.type === 'separator') continue;
            const folder = path.join(' › ');
            if (child.url) {
              if (OPENABLE.test(child.url)) {
                items.push({ type: 'bookmark', id: child.id, title: child.title || '', url: child.url, folder, dateAdded: child.dateAdded });
              }
            } else if (node === root) {
              walk(child, path);
            } else {
              const count = (child.children || []).filter((c) => c.url && OPENABLE.test(c.url)).length;
              items.push({ type: 'folder', id: child.id, title: child.title || '', folder, count, dateAdded: child.dateAdded });
              walk(child, [...path, child.title || 'Untitled']);
            }
          }
        };
        walk(root, []);
        return items;
      },
      (err) => {
        bookmarkCache = null;
        throw err;
      },
    );
    return bookmarkCache;
  }

  // Open tabs in every window, except the one searching and tabs from private
  // windows when it's a normal one (or the other way round).
  async function openTabs(current) {
    const tabs = await browser.tabs.query({ hidden: false });
    return tabs
      .filter((t) => t.id !== current?.id && t.incognito === !!current?.incognito)
      .map((t) => ({ type: 'tab', id: t.id, windowId: t.windowId, title: t.title || '', url: t.url || '', lastAccessed: t.lastAccessed || 0 }));
  }

  // History entries containing `text`, most recent first.
  async function visited(text, maxResults) {
    const items = await browser.history.search({ text, startTime: 0, maxResults });
    return items
      .filter((h) => OPENABLE.test(h.url))
      .map((h) => ({
        type: 'history',
        title: h.title || '',
        url: h.url,
        visitCount: h.visitCount || 0,
        lastVisitTime: h.lastVisitTime || 0,
      }));
  }

  // Firefox's most visited sites, as on its new-tab page: one page per site,
  // ranked by Firefox's own frecency, with the ones you pinned there and
  // without the ones you removed. Search shortcuts are left out. If Firefox
  // can't list them, the box still shows your tabs.
  async function topSites() {
    try {
      const sites = await browser.topSites.get({ includePinned: true, limit: MAX_RESULTS });
      return sites
        .filter((s) => s.type !== 'search' && OPENABLE.test(s.url))
        .map((s) => ({ type: 'site', title: s.title || '', url: s.url }));
    } catch {
      return [];
    }
  }

  // What an empty box shows: the newest bookmarks, the latest history, or the
  // most recently used tabs. o lists the first few tabs, then the most visited
  // sites that aren't among them, then the other tabs. A private window gets
  // only its tabs: Firefox's private new-tab page doesn't show top sites
  // either, so they don't appear on screen there.
  async function recent(source, tab) {
    if (source === 'web') return [];
    if (source === 'history') return visited('', MAX_RESULTS);
    if (source === 'bookmarks') {
      return (await allBookmarks()).filter((b) => b.type === 'bookmark').sort((a, b) => b.dateAdded - a.dateAdded);
    }
    const listSites = source === 'all' && !tab?.incognito;
    const [open, sites] = await Promise.all([openTabs(tab), listSites ? topSites() : []]);
    const tabs = open.sort((a, b) => b.lastAccessed - a.lastAccessed);
    const first = tabs.slice(0, RECENT_TABS);
    const listed = new Set([tab?.url, ...first.map((t) => t.url)]);
    return [...first, ...sites.filter((s) => !listed.has(s.url)), ...tabs.slice(RECENT_TABS)];
  }

  // The URL a typed word stands for, if it looks like an address.
  function asUrl(word) {
    if (/^https?:\/\/\S+$/i.test(word)) return word;
    const m = /^((?:[\w-]+\.)*[\w-]+)(:\d+)?(\/\S*)?$/.exec(word);
    if (!m) return null;
    const [, host, port, path] = m;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})$/i.test(host)) return `http://${word}`;
    const labels = host.split('.');
    if (labels.length < 2) return null;
    return TLDS.has(labels.at(-1).toLowerCase()) || port || path ? `https://${word}` : null;
  }

  // A search engine named by its keyword (set in Firefox's search settings) or
  // by @ and the start of its name: @wikipedia, @duck.
  function engineFor(word, engines) {
    const w = word.toLowerCase();
    const byAlias = engines.find((e) => e.alias?.toLowerCase() === w);
    if (byAlias || w.length < 2 || !w.startsWith('@')) return byAlias || null;
    return engines.find((e) => e.name.toLowerCase().replace(/\s+/g, '').startsWith(w.slice(1))) || null;
  }

  const webSearch = (engine, text) => ({ type: 'web', engine: engine.name, query: text, title: text });
  const defaultEngine = (engines) => engines.find((e) => e.isDefault) || engines[0];

  // What text opens when it's taken as it is, without looking through tabs,
  // bookmarks and history: the address, if it's one, or else a search with the
  // default engine.
  async function forText(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const address = words.length === 1 ? asUrl(words[0]) : null;
    if (address) return { type: 'url', title: address, url: address };
    const engine = defaultEngine(await browser.search.get());
    if (!engine) throw new Error('No search engine to search with');
    return webSearch(engine, words.join(' '));
  }

  // Each typed word, lower-cased, with a pattern that finds it at the start of
  // a word.
  const terms = (words) =>
    words.map((word) => ({ word, atWord: new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(word)}`, 'u') }));

  // 3 when the text starts with the word, 2 when a word inside it does, 1 when
  // it's anywhere else, 0 when it's missing.
  function place(text, { word, atWord }) {
    const i = text.indexOf(word);
    if (i === -1) return 0;
    if (i === 0) return 3;
    return atWord.test(text) ? 2 : 1;
  }

  // Points for where a word is found, indexed by place().
  const TITLE = [0, 4, 7, 10];
  const SITE = [0, 3, 6, 9];
  const FOLDER = [0, 2, 5, 5];

  // How well the words match an item, from 0 (some word is missing) to 10.
  function match(item, words) {
    const title = item.title.toLowerCase();
    const address = (item.url || '').toLowerCase().replace(/^[a-z][\w+.-]*:\/\/(www\.)?/, '');
    const site = address.split('/')[0];
    const folder = (item.folder || '').toLowerCase();
    let total = 0;
    for (const term of words) {
      const best = Math.max(
        TITLE[place(title, term)],
        SITE[place(site, term)],
        address.includes(term.word) ? 2 : 0,
        FOLDER[place(folder, term)],
      );
      if (!best) return 0;
      total += best;
    }
    return total / words.length;
  }

  // How much a page is used, as Tridactyl's "frecency" counts it: its visits,
  // scaled down once the last visit is more than 90 days old. Firefox's own
  // frecency weighs each visit, but extensions only see the count and the
  // latest one.
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const frecency = ({ visitCount, lastVisitTime }, now) =>
    visitCount * Math.min(1, NINETY_DAYS / Math.max(1, now - lastVisitTime));

  // Breaks near-ties: open tabs first, then bookmarks, and pages used often
  // and lately above the rest. Usage adds 2 at most (about 1000 recent
  // visits), so it can't lift a page with the words only somewhere in its
  // title above one whose title starts with them.
  const TYPE_BONUS = { tab: 2, bookmark: 1, folder: 1 };
  const MAX_USAGE = 2;
  const bonus = (item, usage) => (TYPE_BONUS[item.type] || 0) + Math.min(MAX_USAGE, Math.log10(1 + usage) / 1.5);

  // Results for the typed text, best first. `source` is 'all', 'tabs',
  // 'bookmarks', 'history' or 'web'; a symbol in the text overrides it.
  async function search(query = '', { source = 'all', tab } = {}) {
    const raw = String(query).trim().split(/\s+/).filter(Boolean);
    // Own properties only, so words like "constructor" stay search words.
    const symbol = (word) => (Object.hasOwn(SYMBOLS, word) ? SYMBOLS[word] : null);
    for (const word of raw) source = symbol(word) || source;
    const typed = raw.filter((word) => !symbol(word));
    const wants = (s) => source === 'all' || source === s;

    if (!typed.length) return (await recent(source, tab)).slice(0, MAX_RESULTS);

    // Every source at once, so a keystroke waits for the slowest lookup
    // rather than all of them in turn. History is looked up for tabs and
    // bookmarks too, for how much their pages are used; it only finds pages
    // with the longest word in their title or URL.
    const longest = typed.reduce((a, b) => (b.length > a.length ? b : a));
    const [engines, tabs, bookmarks, history] = await Promise.all([
      wants('web') ? browser.search.get() : [],
      wants('tabs') ? openTabs(tab) : [],
      wants('bookmarks') ? allBookmarks() : [],
      source !== 'web' ? visited(longest, 500) : [],
    ]);
    const keyword = typed.length > 1 ? engineFor(typed[0], engines) : null;
    if (keyword) return [webSearch(keyword, typed.slice(1).join(' '))];

    const words = terms(typed.map((w) => w.toLowerCase()));
    const now = Date.now();
    const usage = new Map(history.map((h) => [h.url, frecency(h, now)]));
    const items = [...tabs, ...bookmarks, ...(wants('history') ? history : [])];

    // A page that's open, or bookmarked, is listed once: as the tab, then as
    // the bookmark. Items come in that order.
    const seen = new Set();
    const ranked = [];
    for (const item of items) {
      if (item.url && item.type !== 'tab' && seen.has(item.url)) continue;
      const score = match(item, words);
      if (!score) continue;
      if (item.url) seen.add(item.url);
      ranked.push({ item, score, rank: score + bonus(item, usage.get(item.url) || 0) });
    }
    ranked.sort((a, b) => b.rank - a.rank);

    const engine = defaultEngine(engines);
    const text = typed.join(' ');
    const address = typed.length === 1 && wants('web') ? asUrl(typed[0]) : null;
    return [
      ...(address ? [{ type: 'url', title: address, url: address }] : []),
      ...ranked.filter((r) => r.rank >= STRONG).map((r) => r.item),
      ...(engine ? [webSearch(engine, text)] : []),
      ...ranked.filter((r) => r.rank < STRONG).map((r) => r.item),
    ].slice(0, MAX_RESULTS);
  }

  // Opens a result from search(), from the tab `tab`. `background` keeps new
  // tabs from taking focus.
  async function open(result, { newTab = false, background = false, tab }) {
    const create = (url, i = 0) =>
      browser.tabs.create({ url, active: !background && i === 0, index: tab.index + 1 + i, openerTabId: tab.id });
    switch (result.type) {
      case 'tab':
        await browser.tabs.update(result.id, { active: true });
        return browser.windows.update(result.windowId, { focused: true });
      case 'folder': {
        const children = await browser.bookmarks.getChildren(result.id);
        const urls = children.filter((c) => c.url && OPENABLE.test(c.url)).map((c) => c.url);
        for (const [i, url] of urls.entries()) await create(url, i);
        return undefined;
      }
      case 'web':
        return browser.search.search({
          query: result.query,
          engine: result.engine,
          ...(newTab ? { disposition: 'NEW_TAB' } : { tabId: tab.id }),
        });
      default:
        if (!OPENABLE.test(result.url)) throw new Error(`Can't open ${result.url}`);
        return newTab ? create(result.url) : browser.tabs.update(tab.id, { url: result.url });
    }
  }

  // Closes a tab result or deletes a history one. Bookmarks are never removed.
  function remove(result) {
    if (result.type === 'tab') return browser.tabs.remove(result.id);
    if (result.type === 'history') return browser.history.deleteUrl({ url: result.url });
    throw new Error('Only tabs and history entries can be removed');
  }

  return { search, forText, open, remove, SYMBOLS };
})();
