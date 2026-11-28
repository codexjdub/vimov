'use strict';

// Background event page: tab and browser operations a content script can't do
// itself, the address-bar keyword, and the toolbar button. Messages are
// { cmd, ...args } and resolve to { ok, result } or { error }. Searching lives
// in sources.js.

const handlers = {
  nextTab: ({ count }, tab) => selectRelative(tab, count),
  previousTab: ({ count }, tab) => selectRelative(tab, -count),
  firstTab: async (_, tab) => switchTo(tab, await visibleTabs(tab), 0),
  lastTab: async (_, tab) => {
    const tabs = await visibleTabs(tab);
    return switchTo(tab, tabs, tabs.length - 1);
  },
  newTab: () => browser.tabs.create({}),
  closeTab: async ({ count }, tab) => {
    const tabs = await visibleTabs(tab);
    const start = tabs.findIndex((t) => t.id === tab.id);
    return browser.tabs.remove(tabs.slice(start, start + count).map((t) => t.id));
  },
  restoreTab: () => browser.sessions.restore(),
  duplicateTab: (_, tab) => browser.tabs.duplicate(tab.id),
  moveTab: async ({ count }, tab) => {
    const from = (await visibleTabs(tab)).findIndex((t) => t.id === tab.id);
    await browser.tabs.move(tab.id, { index: Math.max(0, tab.index + count) });
    const tabs = await visibleTabs(tab);
    showPosition(tab.id, tabs, from, tabs.findIndex((t) => t.id === tab.id));
  },
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
  openSearch: ({ in: source, newTab, query }, tab) =>
    browser.tabs.sendMessage(tab.id, { cmd: 'openSearch', in: source, newTab, query }, { frameId: 0 }),
  search: ({ query, in: source }, tab) => Sources.search(query, { source, tab }),
  openResult: ({ result, newTab }, tab) => Sources.open(result, { newTab, tab }),
  removeResult: ({ result }) => Sources.remove(result),
  tally: (counts) => tally(counts),
  // :screenshot (src/content/screenshot.js) runs in the top frame.
  startScreenshot: (_, tab) => browser.tabs.sendMessage(tab.id, { cmd: 'screenshot' }, { frameId: 0 }),
  shotStart: ({ width, height, title, url }, tab) => {
    shots.set(tab.id, { stitcher: new Vimov.Stitcher({ width, height }), title, url, when: Date.now() });
  },
  shotTake: (screen, tab) => takeScreen(screen, tab),
  shotFinish: (_, tab) => finishShot(tab),
  shotCancel: (_, tab) => {
    shots.delete(tab.id);
    return showButton(tab.id, tab.url);
  },
  // From the tab that shows a screenshot (src/shot/shot.js).
  shotResult: ({ id }) => shotResults.get(id)?.shot ?? null,
};

// Tabs in the window that aren't hidden (Firefox can hide tabs).
const visibleTabs = (tab) => browser.tabs.query({ windowId: tab.windowId, hidden: false });
const activate = (tab) => browser.tabs.update(tab.id, { active: true });

async function selectRelative(tab, delta) {
  const tabs = await visibleTabs(tab);
  const i = tabs.findIndex((t) => t.id === tab.id);
  return switchTo(tab, tabs, (((i + delta) % tabs.length) + tabs.length) % tabs.length);
}

// The tab at `index` in the window shows, for a moment, where it is among
// the `tabs` ("Tab 4 of 9"), coming from `from`. A tab Vimov can't run in
// (about: pages, the add-ons store) shows nothing.
function showPosition(tabId, tabs, from, index) {
  if (index < 0) return;
  browser.tabs
    .sendMessage(tabId, { cmd: 'tabPosition', from, index, count: tabs.length }, { frameId: 0 })
    .catch(() => {});
}

// Goes from `tab` to tabs[index], for the tab commands.
async function switchTo(tab, tabs, index) {
  const next = tabs[index];
  if (!next) return;
  await activate(next);
  if (next.id !== tab.id) tally({ tabs: 1 });
  showPosition(next.id, tabs, tabs.findIndex((t) => t.id === tab.id), index);
}

// Adds counts to "Your week with Vimov" (src/shared/stats.js), one batch
// after another, so two arriving together can't both start from the same
// old totals.
let tallying = Promise.resolve();
function tally(counts) {
  tallying = tallying
    .then(async () => {
      const { stats } = await browser.storage.local.get({ stats: null });
      await browser.storage.local.set({ stats: Vimov.addTally(stats, counts, new Date()) });
    })
    .catch((err) => console.error('Vimov:', err));
  return tallying;
}

// Screenshots being taken, by tab; and those taken, by the id in the address
// of the tab that shows them, until that tab closes.
const shots = new Map();
const shotResults = new Map(); // id → { tabId, shot: { title, url, when, parts } }

// A picture of the screen as it is now, added to the screenshot. The
// toolbar button shows how far along it is.
async function takeScreen({ top, rect, viewport, progress }, tab) {
  const shot = shots.get(tab.id);
  if (!shot) throw new Error('Screenshot stopped');
  // Firefox takes a picture of the tab in front, so it has to be this one.
  if (!(await browser.tabs.get(tab.id))?.active) throw new Error('Screenshot stopped: its tab went to the background');
  let data;
  try {
    data = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (err) {
    console.error('Vimov:', err);
    throw new Error('Firefox didn’t let Vimov take a picture of this page');
  }
  const image = await createImageBitmap(await (await fetch(data)).blob());
  try {
    shot.stitcher.draw(image, { top, rect, viewport });
  } finally {
    image.close?.();
  }
  browser.action.setBadgeText({ tabId: tab.id, text: `${Math.round(progress * 100)}%` }).catch(() => {});
}

// Puts the pictures together and opens them in a tab beside the page.
async function finishShot(tab) {
  const shot = shots.get(tab.id);
  if (!shot) throw new Error('Screenshot stopped');
  shots.delete(tab.id);
  try {
    const parts = await shot.stitcher.finish();
    const id = crypto.randomUUID();
    // Kept before the tab opens, so it's there when the tab asks.
    const entry = { tabId: null, shot: { title: shot.title, url: shot.url, when: shot.when, parts } };
    shotResults.set(id, entry);
    const url = `${browser.runtime.getURL('src/shot/shot.html')}#${id}`;
    entry.tabId = (await browser.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id })).id;
  } finally {
    showButton(tab.id, tab.url).catch(() => {});
  }
}

browser.tabs.onRemoved.addListener((tabId) => {
  shots.delete(tabId);
  for (const [id, { tabId: shown }] of shotResults) if (shown === tabId) shotResults.delete(id);
});

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

// "Follow Firefox's setting", the default tab layout: whether Firefox shows
// tabs down the side. Only this page can ask (browserSettings, on Firefox
// 142 and later), so it keeps the answer in storage.local, where content
// scripts read it. Zen always has them down the side, whatever Firefox's
// setting says. On a Firefox that can't tell, it's false: tabs across the
// top.
async function readTabLayout() {
  let vertical = await Vimov.isZen();
  try {
    vertical ||= (await browser.browserSettings?.verticalTabs?.get({}))?.value === true;
  } catch {}
  const { firefoxVerticalTabs } = await browser.storage.local.get({ firefoxVerticalTabs: false });
  if (vertical !== firefoxVerticalTabs) await browser.storage.local.set({ firefoxVerticalTabs: vertical });
}

// Read whenever this page starts, and again each time the layout changes.
browser.browserSettings?.verticalTabs?.onChange.addListener(readTabLayout);
readTabLayout();
browser.runtime.onInstalled.addListener(({ reason, temporary } = {}) => {
  // A first install opens the welcome page; an update, or loading Vimov
  // from about:debugging while working on it, doesn't.
  if (reason === 'install' && !temporary) {
    browser.tabs.create({ url: browser.runtime.getURL('src/welcome/welcome.html') });
  }
  return showButtonInActiveTabs();
});
