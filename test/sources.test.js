'use strict';

// src/sources.js: what the vbar and the address-bar keyword find, how
// it's ranked, and how results open.

const test = require('node:test');
const assert = require('node:assert');
const { load, get, plain, event } = require('./helpers');

const bookmark = (id, title, url, dateAdded = 0) => ({ id, type: 'bookmark', title, url, dateAdded });
const folder = (id, title, children) => ({ id, type: 'folder', title, children });

const DOCS = Array.from({ length: 12 }, (_, i) => bookmark(`d${i}`, `Design doc ${i + 1}`, `https://docs.example.com/${i + 1}`, i));

const TABS = [
  { id: 1, windowId: 1, title: 'Vimov playground', url: 'http://127.0.0.1:8765/dev/playground.html', lastAccessed: 50, incognito: false },
  { id: 2, windowId: 1, title: 'codexjdub/vimov: Vim-style keyboard browsing', url: 'https://github.com/codexjdub/vimov', lastAccessed: 40, incognito: false },
  { id: 3, windowId: 2, title: 'Array.prototype.map() - JavaScript | MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map', lastAccessed: 30, incognito: false },
  { id: 4, windowId: 1, title: 'Inbox (3) - Mail', url: 'https://mail.example.com/inbox', lastAccessed: 45, incognito: false },
  { id: 5, windowId: 3, title: 'Private tab', url: 'https://private.example.com/', lastAccessed: 60, incognito: true },
  { id: 6, windowId: 1, title: 'Object.prototype.constructor - JavaScript | MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/constructor', lastAccessed: 10, incognito: false },
];

const TREE = [
  folder('root', '', [
    folder('menu', 'Bookmarks Menu', [bookmark('b1', 'MDN Web Docs', 'https://developer.mozilla.org/', 5)]),
    folder('toolbar', 'Bookmarks Toolbar', [
      bookmark('b2', 'Hacker News', 'https://news.ycombinator.com/', 9),
      bookmark('b3', 'Vimov on GitHub', 'https://github.com/codexjdub/vimov', 8),
      folder('work', 'Work', [
        bookmark('b4', 'Vimov issues', 'https://github.com/codexjdub/vimov/issues', 7),
        folder('docs', 'Docs', DOCS),
        { id: 's1', type: 'separator' },
      ]),
      folder('zebra', 'Zebra', [folder('untitled', '', [bookmark('u1', 'Quarterly plan', 'https://plan.example.com/', 1)])]),
      bookmark('b6', 'Bookmarklet', 'javascript:alert(1)'),
    ]),
  ]),
];

const HISTORY = [
  { url: 'https://www.youtube.com/watch?v=cats', title: 'Funny cats compilation', visitCount: 3 },
  { url: 'https://news.ycombinator.com/', title: 'Hacker News', visitCount: 120 },
  { url: 'https://www.wikipedia.org/', title: 'Wikipedia', visitCount: 40 },
];

const ENGINES = [
  { name: 'Google', isDefault: true },
  { name: 'Wikipedia (en)', isDefault: false, alias: 'wk' },
  { name: 'DuckDuckGo', isDefault: false },
];

// A fake browser API over the data above. `calls` records what Sources did.
function fakeBrowser(overrides = {}) {
  const calls = [];
  const record = (name) => async (...args) => calls.push([name, ...args]);
  const browser = {
    tabs: { query: async () => TABS, update: record('tabs.update'), create: record('tabs.create'), remove: record('tabs.remove') },
    windows: { update: record('windows.update') },
    bookmarks: {
      getTree: async () => TREE,
      getChildren: async (id) => (id === 'docs' ? DOCS : []),
      onCreated: event(), onRemoved: event(), onChanged: event(), onMoved: event(),
    },
    history: {
      search: async ({ text, maxResults }) =>
        HISTORY.filter((h) => `${h.title} ${h.url}`.toLowerCase().includes(text.toLowerCase())).slice(0, maxResults),
      deleteUrl: record('history.deleteUrl'),
    },
    search: { get: async () => ENGINES, search: record('search.search') },
    ...overrides,
  };
  return { browser, calls };
}

function setup(overrides) {
  const { browser, calls } = fakeBrowser(overrides);
  const Sources = get(load(['src/sources.js'], { browser }), 'Sources');
  const tab = { id: 1, index: 0, windowId: 1, incognito: false };
  const search = async (query, source) => plain(await Sources.search(query, { source, tab }));
  return { Sources, calls, tab, search };
}

const brief = (results) => results.map((r) => `${r.type}:${r.title}`);

test('empty box lists recent tabs, not this one or private ones', async () => {
  const { search } = setup();
  assert.deepStrictEqual((await search('')).map((r) => r.id), [4, 2, 3, 6]);
});

test('empty bookmarks box lists newest bookmarks', async () => {
  const { search } = setup();
  const results = await search('', 'bookmarks');
  assert.deepStrictEqual(results.slice(0, 2).map((r) => r.title), ['Design doc 12', 'Design doc 11']);
  assert(results.every((r) => r.type === 'bookmark'));
});

test('open tab beats the bookmark with the same URL', async () => {
  const { search } = setup();
  const same = (await search('vimov')).filter((r) => r.url === 'https://github.com/codexjdub/vimov');
  assert.deepStrictEqual(same.map((r) => r.type), ['tab']);
});

test('strong matches go above the web search', async () => {
  const { search } = setup();
  assert.deepStrictEqual(brief(await search('hacker')).slice(0, 2), ['bookmark:Hacker News', 'web:hacker']);
});

test('a tab with a word starting the same goes above the web search', async () => {
  const { search } = setup();
  assert.deepStrictEqual((await search('vimov')).map((r) => r.type).slice(0, 3), ['bookmark', 'tab', 'web']);
});

test('weak matches go below the web search', async () => {
  const { search } = setup();
  const results = await search('cats');
  assert.strictEqual(results[0].type, 'web');
  assert(brief(results).includes('history:Funny cats compilation'));
});

test('every word must match, in any order', async () => {
  const { search } = setup();
  const results = await search('issues vimov');
  assert.strictEqual(results[0].title, 'Vimov issues');
  assert(!brief(results).includes('tab:Inbox (3) - Mail'));
});

test('folder path matches', async () => {
  const { search } = setup();
  const [first] = (await search('work issues')).filter((r) => r.type !== 'web');
  assert.deepStrictEqual([first.title, first.folder], ['Vimov issues', 'Work']);
});

test('folders are results with a bookmark count', async () => {
  const { search } = setup();
  const docs = (await search('docs', 'bookmarks')).find((r) => r.type === 'folder');
  assert.deepStrictEqual([docs.count, docs.folder], [12, 'Work']);
});

test('top-level folders are not results or path parts', async () => {
  const { search } = setup();
  assert.deepStrictEqual(await search('toolbar', 'bookmarks'), []);
});

test('bookmarklets and separators are left out', async () => {
  const { search } = setup();
  assert.deepStrictEqual(await search('bookmarklet', 'bookmarks'), []);
});

test('a folder without a name is "Untitled" in the paths below it', async () => {
  const { search } = setup();
  const results = await search('zebra', 'bookmarks');
  assert.deepStrictEqual(
    results.map((r) => [r.type, r.title, r.folder]),
    [['folder', 'Zebra', ''], ['folder', '', 'Zebra'], ['bookmark', 'Quarterly plan', 'Zebra › Untitled']],
  );
});

test('* limits to bookmarks', async () => {
  const { search } = setup();
  const results = await search('* vimov');
  assert(results.length && results.every((r) => r.type === 'bookmark' || r.type === 'folder'), brief(results).join());
});

test('% limits to tabs, at the end too', async () => {
  const { search } = setup();
  assert.deepStrictEqual(brief(await search('vimov %')), ['tab:codexjdub/vimov: Vim-style keyboard browsing']);
});

test('^ limits to history', async () => {
  const { search } = setup();
  assert.deepStrictEqual(brief(await search('^ news')), ['history:Hacker News']);
});

test('? is only a web search', async () => {
  const { search } = setup();
  assert.deepStrictEqual(brief(await search('? vimov')), ['web:vimov']);
});

test('words like "constructor" are search words, not source symbols', async () => {
  const { search } = setup();
  const mdn = 'tab:Object.prototype.constructor - JavaScript | MDN';
  assert.deepStrictEqual(brief(await search('mdn constructor')), [mdn, 'web:mdn constructor']);
  assert.deepStrictEqual(brief(await search('constructor')), [mdn, 'web:constructor']);
  assert(brief(await search('toString valueOf')).includes('web:toString valueOf'));
});

test('in=tabs has no web search', async () => {
  const { search } = setup();
  assert.deepStrictEqual(await search('zzz', 'tabs'), []);
});

test('engine keyword', async () => {
  const { search } = setup();
  const [r, ...rest] = await search('wk cats');
  assert.deepStrictEqual([r.type, r.engine, r.query, rest.length], ['web', 'Wikipedia (en)', 'cats', 0]);
});

test('@name engine', async () => {
  const { search } = setup();
  const [r] = await search('@duck cats');
  assert.deepStrictEqual([r.engine, r.query], ['DuckDuckGo', 'cats']);
});

test('addresses', async () => {
  const { search } = setup();
  const first = async (q) => (await search(q))[0];
  assert.deepStrictEqual(await first('github.com'), { type: 'url', title: 'https://github.com', url: 'https://github.com' });
  assert.strictEqual((await first('localhost:8080')).url, 'http://localhost:8080');
  assert.strictEqual((await first('foo.test/x')).url, 'https://foo.test/x');
  assert.strictEqual((await first('http://x.y')).url, 'http://x.y');
  assert.notStrictEqual((await first('node.js')).type, 'url');
  assert.notStrictEqual((await first('github.com stars')).type, 'url');
});

test('text taken as it is opens as an address or a web search, never a tab', async () => {
  const { Sources } = setup();
  const forText = async (text) => plain(await Sources.forText(text));
  assert.deepStrictEqual(await forText('  github.com/codexjdub/vimov\n'), {
    type: 'url', title: 'https://github.com/codexjdub/vimov', url: 'https://github.com/codexjdub/vimov',
  });
  assert.strictEqual((await forText('localhost:3000')).url, 'http://localhost:3000');
  // Hacker News is bookmarked and in history, but the text is still searched for.
  assert.deepStrictEqual(await forText('hacker\n  news'), { type: 'web', engine: 'Google', query: 'hacker news', title: 'hacker news' });
  assert.strictEqual((await forText('javascript:alert(1)')).type, 'web');
});

test('at most 10 results', async () => {
  const { search } = setup();
  assert((await search('doc')).length <= 10);
});

test('tabs, bookmarks, history and engines are looked up at the same time', async () => {
  // Each lookup only answers once all four have started, so looking them up
  // one after another never finishes.
  const started = new Set();
  let release;
  const allStarted = new Promise((resolve) => (release = resolve));
  const gate = (name, value) => async (...args) => {
    started.add(name);
    if (started.size === 4) release();
    await allStarted;
    return typeof value === 'function' ? value(...args) : value;
  };
  const { browser } = fakeBrowser();
  const { search } = setup({
    tabs: { ...browser.tabs, query: gate('tabs', TABS) },
    bookmarks: { ...browser.bookmarks, getTree: gate('bookmarks', TREE) },
    history: { ...browser.history, search: gate('history', browser.history.search) },
    search: { ...browser.search, get: gate('engines', ENGINES) },
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('lookups ran one after another')), 1000).unref());
  const results = await Promise.race([search('hacker'), timeout]);
  assert.deepStrictEqual(brief(results).slice(0, 2), ['bookmark:Hacker News', 'web:hacker']);
});

test('open: tab switches tab and window', async () => {
  const { Sources, calls, tab } = setup();
  await Sources.open({ type: 'tab', id: 3, windowId: 2 }, { tab });
  assert.deepStrictEqual(plain(calls), [['tabs.update', 3, { active: true }], ['windows.update', 2, { focused: true }]]);
});

test('open: bookmark here, in a new tab, or in a background tab', async () => {
  const { Sources, calls, tab } = setup();
  const result = { type: 'bookmark', url: 'https://a.example/' };
  await Sources.open(result, { tab });
  await Sources.open(result, { newTab: true, tab });
  await Sources.open(result, { newTab: true, background: true, tab });
  assert.deepStrictEqual(plain(calls), [
    ['tabs.update', 1, { url: 'https://a.example/' }],
    ['tabs.create', { url: 'https://a.example/', active: true, index: 1, openerTabId: 1 }],
    ['tabs.create', { url: 'https://a.example/', active: false, index: 1, openerTabId: 1 }],
  ]);
});

test('open: refuses non-web URLs', async () => {
  const { Sources, tab } = setup();
  await assert.rejects(Sources.open({ type: 'url', url: 'javascript:alert(1)' }, { tab }));
});

test('open: folder opens each bookmark in order, first one active', async () => {
  const { Sources, calls, tab } = setup();
  await Sources.open({ type: 'folder', id: 'docs' }, { tab });
  assert.strictEqual(calls.length, 12);
  assert.deepStrictEqual(plain(calls[0][1]), { url: 'https://docs.example.com/1', active: true, index: 1, openerTabId: 1 });
  assert.deepStrictEqual(plain(calls[11][1]), { url: 'https://docs.example.com/12', active: false, index: 12, openerTabId: 1 });
});

test('open: web search here or in a new tab', async () => {
  const { Sources, calls, tab } = setup();
  const result = { type: 'web', engine: 'Google', query: 'cats' };
  await Sources.open(result, { tab });
  await Sources.open(result, { newTab: true, tab });
  assert.deepStrictEqual(plain(calls), [
    ['search.search', { query: 'cats', engine: 'Google', tabId: 1 }],
    ['search.search', { query: 'cats', engine: 'Google', disposition: 'NEW_TAB' }],
  ]);
});

test('remove: tabs and history only', async () => {
  const { Sources, calls } = setup();
  await Sources.remove({ type: 'tab', id: 4 });
  await Sources.remove({ type: 'history', url: 'https://x.example/' });
  assert.deepStrictEqual(plain(calls), [['tabs.remove', 4], ['history.deleteUrl', { url: 'https://x.example/' }]]);
  assert.throws(() => Sources.remove({ type: 'bookmark', id: 'b1' }));
});
