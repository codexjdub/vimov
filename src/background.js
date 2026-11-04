'use strict';

// Background event page: tab and browser operations a content script can't do
// itself, and the address-bar keyword. Messages are { cmd, ...args } and
// resolve to { ok, result } or { error }. Searching lives in sources.js.

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
  // The Search bar opens in the top frame, even when a key was pressed in an iframe.
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
  const handler = handlers[message?.cmd];
  if (!handler || !sender.tab) return undefined;
  return Promise.resolve()
    .then(() => handler({ count: 1, ...message }, sender.tab))
    .then(
      (result) => ({ ok: true, result }),
      (err) => ({ error: err?.message || String(err) }),
    );
});

// The address-bar keyword: "v", a space, then the same search as the Search
// bar. Firefox shows suggestions as plain text.
const TAGS = { tab: 'Tab', bookmark: 'Bookmark', history: 'History' };
let suggested = new Map(); // suggestion content (its URL) → result

const describe = (r) => (r.type === 'url' ? `Open ${r.url}` : `${TAGS[r.type]}: ${r.title || r.url} — ${r.url}`);

const activeTab = async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0];

browser.omnibox.setDefaultSuggestion({ description: 'Vimov: search tabs, bookmarks and history' });

browser.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const results = (await Sources.search(text, { tab: await activeTab() })).filter((r) => r.url);
  suggested = new Map(results.map((r) => [r.url, r]));
  suggest(results.map((r) => ({ content: r.url, description: describe(r) })));
});

// Enter on a suggestion opens it; Enter on typed text opens the best result,
// which is the web search unless something matched well.
browser.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const tab = await activeTab();
  const result = suggested.get(text) || (await Sources.search(text, { tab }))[0];
  if (result) await Sources.open(result, { newTab: disposition !== 'currentTab', tab });
});
