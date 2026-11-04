'use strict';

// What the Search bar and the address-bar keyword look through: open tabs,
// bookmarks, history and search engines, matched against the typed words and
// ranked together. Runs in the background page, which has the APIs.

const Sources = (() => {
  const MAX_RESULTS = 10;
  // Words that limit a search to one source, as in Firefox's address bar.
  const SYMBOLS = { '*': 'bookmarks', '%': 'tabs', '^': 'history', '?': 'web' };
  // A result ranked at least this high is listed above the web search: a
  // title or site that starts with the words, or an open tab where a word in
  // the title does.
  const STRONG = 9;
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
      .map((h) => ({ type: 'history', title: h.title || '', url: h.url, visitCount: h.visitCount || 0 }));
  }

  // What an empty box shows: the most recently used tabs, the newest
  // bookmarks, or the latest history.
  async function recent(source, tab) {
    if (source === 'web') return [];
    if (source === 'history') return visited('', MAX_RESULTS);
    if (source === 'bookmarks') {
      return (await allBookmarks()).filter((b) => b.type === 'bookmark').sort((a, b) => b.dateAdded - a.dateAdded);
    }
    return (await openTabs(tab)).sort((a, b) => b.lastAccessed - a.lastAccessed);
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

  // Breaks near-ties: open tabs first, then pages visited often, then bookmarks.
  function bonus(item) {
    if (item.type === 'tab') return 2;
    if (item.type === 'history') return Math.min(1.5, Math.log10(item.visitCount || 1) / 1.5);
    return 1;
  }

  // Results for the typed text, best first. `source` is 'all', 'tabs',
  // 'bookmarks', 'history' or 'web'; a symbol in the text overrides it.
  async function search(query = '', { source = 'all', tab } = {}) {
    const raw = String(query).trim().split(/\s+/).filter(Boolean);
    // Own properties only, so words like "constructor" stay search words.
    const symbol = (word) => (Object.hasOwn(SYMBOLS, word) ? SYMBOLS[word] : null);
    for (const word of raw) source = symbol(word) || source;
    const typed = raw.filter((word) => !symbol(word));
    const wants = (s) => source === 'all' || source === s;

    const engines = wants('web') ? await browser.search.get() : [];
    const keyword = typed.length > 1 ? engineFor(typed[0], engines) : null;
    if (keyword) return [webSearch(keyword, typed.slice(1).join(' '))];
    if (!typed.length) return (await recent(source, tab)).slice(0, MAX_RESULTS);

    const words = terms(typed.map((w) => w.toLowerCase()));
    const longest = typed.reduce((a, b) => (b.length > a.length ? b : a));
    const items = [
      ...(wants('tabs') ? await openTabs(tab) : []),
      ...(wants('bookmarks') ? await allBookmarks() : []),
      ...(wants('history') ? await visited(longest, 500) : []),
    ];

    // A page that's open, or bookmarked, is listed once: as the tab, then as
    // the bookmark. Items come in that order.
    const seen = new Set();
    const ranked = [];
    for (const item of items) {
      if (item.url && item.type !== 'tab' && seen.has(item.url)) continue;
      const score = match(item, words);
      if (!score) continue;
      if (item.url) seen.add(item.url);
      ranked.push({ item, score, rank: score + bonus(item) });
    }
    ranked.sort((a, b) => b.rank - a.rank);

    const engine = engines.find((e) => e.isDefault) || engines[0];
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

  return { search, open, remove, SYMBOLS };
})();
