'use strict';

// Background event page: tab and browser operations a content script can't do
// itself, the address-bar keyword, and the toolbar button. Messages are
// { cmd, ...args } and resolve to { ok, result } or { error }. Searching lives
// in sources.js.

const handlers = {
  nextTab: ({ count }, tab) => selectRelative(tab, count),
  previousTab: ({ count }, tab) => selectRelative(tab, -count),
  firstTab: async (_, tab) => activate((await visibleTabs(tab))[0]),
  lastTab: async (_, tab) => activate((await visibleTabs(tab)).at(-1)),
  newTab: () => browser.tabs.create({}),
  closeTab: async ({ count }, tab) => {
    const tabs = await visibleTabs(tab);
    const start = tabs.findIndex((t) => t.id === tab.id);
    return browser.tabs.remove(tabs.slice(start, start + count).map((t) => t.id));
  },
  restoreTab: () => browser.sessions.restore(),
  duplicateTab: (_, tab) => browser.tabs.duplicate(tab.id),
  moveTab: ({ count }, tab) => browser.tabs.move(tab.id, { index: Math.max(0, tab.index + count) }),
  togglePinTab: (_, tab) => browser.tabs.update(tab.id, { pinned: !tab.pinned }),
  reload: ({ hard }, tab) => browser.tabs.reload(tab.id, { bypassCache: !!hard }),
  openUrl: ({ url, active }, tab) =>
    browser.tabs.create({ url, active: !!active, index: tab.index + 1, openerTabId: tab.id }),
  openOptions: () => browser.runtime.openOptionsPage(),
  copyText: ({ text }) => navigator.clipboard.writeText(text),
  openClipboard: async ({ newTab }, tab) => {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) throw new Error('The clipboard is empty');
    return Sources.open(await Sources.forText(text), { newTab, tab });
  },
  // Firefox decides which pages Reader View can show. Vimov can only open it:
  // extensions don't run in Reader View, so its keys don't work there.
  readerView: async (_, tab) => {
    if (!(await browser.tabs.get(tab.id)).isArticle) throw new Error('Reader View isn’t available for this page');
    return browser.tabs.toggleReaderMode(tab.id);
  },
  // The vbar opens in the top frame, even when a key was pressed in an iframe.
  openSearch: ({ in: source, newTab }, tab) =>
    browser.tabs.sendMessage(tab.id, { cmd: 'openSearch', in: source, newTab }, { frameId: 0 }),
  search: ({ query, in: source }, tab) => Sources.search(query, { source, tab }),
  openResult: ({ result, newTab }, tab) => Sources.open(result, { newTab, tab }),
  removeResult: ({ result }) => Sources.remove(result),
};

// Tabs in the window that aren't hidden (Firefox can hide tabs).
const visibleTabs = (tab) => browser.tabs.query({ windowId: tab.windowId, hidden: false });
const activate = (tab) => browser.tabs.update(tab.id, { active: true });

async function selectRelative(tab, delta) {
  const tabs = await visibleTabs(tab);
  const i = tabs.findIndex((t) => t.id === tab.id);
  return activate(tabs[(((i + delta) % tabs.length) + tabs.length) % tabs.length]);
}

browser.runtime.onMessage.addListener((message, sender) => {
  const handler = Object.hasOwn(handlers, message?.cmd) ? handlers[message.cmd] : null;
  if (!handler || !sender.tab) return undefined;
  return Promise.resolve()
    .then(() => handler({ count: 1, ...message }, sender.tab))
    .then(
      (result) => ({ ok: true, result }),
      (err) => ({ error: err?.message || String(err) }),
    );
});

// The address-bar keyword: "v", a space, then the same search as the vbar.
// Firefox shows suggestions as plain text.
const TAGS = { tab: 'Tab', bookmark: 'Bookmark', history: 'History', site: 'Site' };
let suggested = new Map(); // suggestion content (its URL) → result
let typedCount = 0; // input changes so far, to spot answers that arrive late

const describe = (r) => (r.type === 'url' ? `Open ${r.url}` : `${TAGS[r.type]}: ${r.title || r.url} — ${r.url}`);

const activeTab = async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0];

browser.omnibox.setDefaultSuggestion({ description: 'Vimov: search tabs, bookmarks and history' });

browser.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const id = ++typedCount;
  const results = await Sources.search(text, { tab: await activeTab() });
  // A search for earlier text that finishes after a later one would replace
  // the suggestions on screen with stale ones.
  if (id !== typedCount) return;
  // Firefox says which suggestion was picked only by its URL, so each URL is
  // offered once, as its best result (two tabs on one page: the first).
  suggested = new Map();
  for (const r of results) if (r.url && !suggested.has(r.url)) suggested.set(r.url, r);
  suggest([...suggested.values()].map((r) => ({ content: r.url, description: describe(r) })));
});

// Enter on a suggestion opens it; Enter on typed text opens the best result,
// which is the web search unless something matched well.
browser.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const tab = await activeTab();
  const result = suggested.get(text) || (await Sources.search(text, { tab }))[0];
  if (result) {
    await Sources.open(result, {
      newTab: disposition !== 'currentTab',
      background: disposition === 'newBackgroundTab',
      tab,
    });
  }
});

// The toolbar button turns Vimov off or on for the current site, by adding
// or removing the site's host in the excluded sites. A site excluded by a
// pattern of your own, or with keys passed through, opens the options page
// instead, so the button never edits a line you wrote.
const exclusionsText = async () => (await browser.storage.sync.get({ exclusions: '' })).exclusions;

function buttonState(text, url) {
  const site = Vimov.keys.siteExclusion(text, url || '');
  if (!site) return { enabled: false, badge: '', title: 'Vimov doesn’t run on this page' };
  const { host, rule, own } = site;
  if (!rule) return { enabled: true, badge: '', title: `Vimov is on. Click to turn it off for ${host}` };
  if (own) return { enabled: true, badge: 'off', title: `Vimov is off for ${host}. Click to turn it back on` };
  const pattern = `“${rule.pattern}” in excluded sites`;
  if (rule.passKeys.size) {
    const keys = [...rule.passKeys].join(' ');
    return { enabled: true, badge: '', title: `Vimov passes ${keys} to this page (${pattern}). Click to change it` };
  }
  return { enabled: true, badge: 'off', title: `Vimov is off here (${pattern}). Click to change it` };
}

async function showButton(tabId, url) {
  const state = buttonState(await exclusionsText(), url);
  await Promise.all([
    state.enabled ? browser.action.enable(tabId) : browser.action.disable(tabId),
    browser.action.setBadgeText({ tabId, text: state.badge }),
    browser.action.setTitle({ tabId, title: state.title }),
  ]);
}

async function showButtonInActiveTabs() {
  const tabs = await browser.tabs.query({ active: true });
  await Promise.all(tabs.map((tab) => showButton(tab.id, tab.url)));
}

browser.action.setBadgeBackgroundColor({ color: '#6b7280' });
browser.action.onClicked.addListener(async (tab) => {
  const text = await exclusionsText();
  const site = Vimov.keys.siteExclusion(text, tab.url || '');
  if (!site) return;
  if (site.rule && !site.own) {
    await browser.runtime.openOptionsPage();
    return;
  }
  // Content scripts and the badge follow from the storage change.
  await browser.storage.sync.set({ exclusions: Vimov.keys.toggleSite(text, site.host) });
});
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  await showButton(tab.id, tab.url);
});
browser.tabs.onUpdated.addListener(
  (tabId, change, tab) => (tab.active ? showButton(tabId, tab.url) : undefined),
  { properties: ['url', 'status'] },
);
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.exclusions) showButtonInActiveTabs();
});
browser.runtime.onStartup.addListener(showButtonInActiveTabs);
browser.runtime.onInstalled.addListener(showButtonInActiveTabs);
