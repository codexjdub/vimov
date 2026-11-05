// Runs Vimov's content scripts as ordinary page scripts with a stand-in
// `browser` API, so they can be exercised in any browser. Serve the repo root
// (node dev/serve.mjs) and open dev/playground.html?harness.
//
// Don't add ?harness in Firefox with the extension loaded: keys would be
// handled twice.

(async () => {
  if (!new URLSearchParams(location.search).has('harness')) return;

  const report = (message) => {
    console.log('[background]', message);
    dispatchEvent(new CustomEvent('vimov-harness-message', { detail: message }));
  };
  const stored = () => JSON.parse(localStorage.getItem('vimov-harness-settings') || '{}');

  // Made-up tabs, bookmarks, history, top sites and search engines for the vbar.
  // src/sources.js runs on them here just as it does in the background page.
  const bookmark = (id, title, url, dateAdded = 0) => ({ id, type: 'bookmark', title, url, dateAdded });
  const folder = (id, title, children) => ({ id, type: 'folder', title, children });
  const daysAgo = (days) => Date.now() - days * 24 * 60 * 60 * 1000;
  const fake = {
    current: { id: 1, index: 0, windowId: 1, incognito: false },
    tabs: [
      { id: 1, windowId: 1, title: 'Vimov playground', url: location.href, lastAccessed: 50, incognito: false },
      { id: 2, windowId: 1, title: 'codexjdub/vimov: Vim-style keyboard browsing', url: 'https://github.com/codexjdub/vimov', lastAccessed: 40, incognito: false },
      { id: 3, windowId: 2, title: 'Array.prototype.map() - JavaScript | MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map', lastAccessed: 30, incognito: false },
      { id: 4, windowId: 1, title: 'Inbox (3) - Mail', url: 'https://mail.example.com/inbox', lastAccessed: 45, incognito: false },
      { id: 5, windowId: 3, title: 'Private tab', url: 'https://private.example.com/', lastAccessed: 60, incognito: true },
    ],
    tree: [
      folder('root', '', [
        folder('menu', 'Bookmarks Menu', [bookmark('b1', 'MDN Web Docs', 'https://developer.mozilla.org/', 5)]),
        folder('toolbar', 'Bookmarks Toolbar', [
          bookmark('b2', 'Hacker News', 'https://news.ycombinator.com/', 9),
          bookmark('b3', 'Vimov on GitHub', 'https://github.com/codexjdub/vimov', 8),
          folder('work', 'Work', [
            bookmark('b4', 'Vimov issues', 'https://github.com/codexjdub/vimov/issues', 7),
            folder('docs', 'Docs', Array.from({ length: 12 }, (_, i) => bookmark(`d${i}`, `Design doc ${i + 1}`, `https://docs.example.com/${i + 1}`, i))),
            { id: 's1', type: 'separator' },
            folder('reading', 'Reading list', [bookmark('b5', 'Cats of the world', 'https://cats.example.com/', 6)]),
          ]),
          bookmark('b6', 'Bookmarklet', 'javascript:alert(1)'),
        ]),
      ]),
    ],
    history: [
      { url: 'https://www.youtube.com/watch?v=cats', title: 'Funny cats compilation', visitCount: 3, lastVisitTime: daysAgo(2) },
      { url: 'https://news.ycombinator.com/', title: 'Hacker News', visitCount: 120, lastVisitTime: daysAgo(1) },
      { url: 'https://www.wikipedia.org/', title: 'Wikipedia', visitCount: 40, lastVisitTime: daysAgo(30) },
      { url: 'https://github.com/codexjdub/vimov/pulls', title: 'Pull requests · codexjdub/vimov', visitCount: 6, lastVisitTime: daysAgo(3) },
    ],
    topSites: [
      { type: 'url', title: 'Hacker News', url: 'https://news.ycombinator.com/' },
      { type: 'url', title: 'codexjdub/vimov', url: 'https://github.com/codexjdub/vimov' },
      { type: 'search', title: '@amazon', url: 'https://www.amazon.com/' },
      { type: 'url', title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
    ],
    engines: [
      { name: 'Google', isDefault: true },
      { name: 'Wikipedia (en)', isDefault: false, alias: 'wk' },
      { name: 'DuckDuckGo', isDefault: false },
    ],
  };
  const findNode = (nodes, id) => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNode(node.children || [], id);
      if (found) return found;
    }
    return null;
  };
  const event = () => ({ addListener() {} });
  // The background-page commands the harness runs for real; the rest are only logged.
  const background = {
    search: ({ query, in: source }) => Sources.search(query, { source, tab: fake.current }),
    removeResult: ({ result }) => Sources.remove(result),
  };

  window.browser = {
    runtime: {
      sendMessage: async (message) => {
        report(message);
        try {
          return { ok: true, result: await background[message.cmd]?.(message) };
        } catch (err) {
          return { error: err.message };
        }
      },
      onMessage: event(),
    },
    tabs: {
      query: async () => fake.tabs,
      remove: async (id) => {
        fake.tabs = fake.tabs.filter((t) => t.id !== id);
      },
    },
    bookmarks: {
      getTree: async () => fake.tree,
      getChildren: async (id) => findNode(fake.tree, id)?.children || [],
      onCreated: event(),
      onRemoved: event(),
      onChanged: event(),
      onMoved: event(),
    },
    history: {
      search: async ({ text, maxResults }) =>
        fake.history.filter((h) => `${h.title} ${h.url}`.toLowerCase().includes(text.toLowerCase())).slice(0, maxResults),
      deleteUrl: async ({ url }) => {
        fake.history = fake.history.filter((h) => h.url !== url);
      },
    },
    search: { get: async () => fake.engines },
    topSites: { get: async () => fake.topSites },
    storage: {
      sync: {
        get: async (defaults) => ({ ...defaults, ...stored() }),
        set: async (values) => localStorage.setItem('vimov-harness-settings', JSON.stringify({ ...stored(), ...values })),
      },
      onChanged: { addListener() {} },
    },
  };

  const load = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `../${src}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Couldn't load ${src}`));
      document.head.append(script);
    });

  const manifest = await (await fetch('../manifest.json')).json();
  const [scripts] = manifest.content_scripts;
  await load('src/sources.js');
  for (const href of scripts.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `../${href}`;
    document.head.append(link);
  }
  for (const src of scripts.js) await load(src);
  document.documentElement.dataset.harness = 'ready';
})();
