'use strict';

// Background event page: tab and browser operations a content script can't do
// itself. Messages are { cmd, ...args } and resolve to { ok } or { error }.

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
      () => ({ ok: true }),
      (err) => ({ error: err?.message || String(err) }),
    );
});
