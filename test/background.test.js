'use strict';

// src/background.js: messages from content scripts, the address-bar keyword
// and the toolbar button. Sources is replaced by a stand-in.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run, plain, event } = require('./helpers');

function setup({
  search = async () => [],
  exclusions = '',
  clipboard = '',
  tabs = [{ id: 1, index: 0, windowId: 1, active: true, url: 'https://example.com/' }],
  browserSettings, // its verticalTabs only on Firefox 142 and later
  browserInfo = { name: 'Firefox' }, // Zen adds `zen`
  capture = async () => 'data:image/png;base64,screen', // tabs.captureVisibleTab
} = {}) {
  const opened = [];
  const captured = []; // [windowId, options] for each picture taken
  const stitched = []; // the stand-in Stitchers made for screenshots
  const sent = []; // messages to content scripts: [tabId, message, options]
  const stored = { exclusions };
  const local = {};
  const button = {}; // tab id → { enabled, badge, title }
  const show = (tabId, change) => (button[tabId] = { ...button[tabId], ...change });
  const browser = {
    runtime: {
      onMessage: event(), onInstalled: event(), onStartup: event(),
      openOptionsPage: async () => opened.push(['options']),
      getURL: (path) => `moz-extension://vimov/${path}`,
      getBrowserInfo: async () => browserInfo,
    },
    omnibox: { setDefaultSuggestion() {}, onInputChanged: event(), onInputEntered: event() },
    tabs: {
      query: async () => tabs,
      get: async (id) => tabs.find((t) => t.id === id),
      toggleReaderMode: async (id) => opened.push(['reader', id]),
      create: async ({ url, index }) => ({ id: 100 + opened.push(index === undefined ? ['tab', url] : ['tab', url, index]) }),
      captureVisibleTab: async (windowId, options) => {
        captured.push([windowId, options]);
        return capture();
      },
      update: async (id, { active }) => {
        if (active) for (const t of tabs) t.active = t.id === id;
        return tabs.find((t) => t.id === id);
      },
      move: async (id, { index }) => {
        const tab = tabs.find((t) => t.id === id);
        tabs.splice(tabs.indexOf(tab), 1);
        tabs.splice(Math.min(index, tabs.length), 0, tab);
        tabs.forEach((t, i) => (t.index = i));
      },
      sendMessage: async (tabId, message, options) => {
        sent.push([tabId, message, options]);
        if (tabId === 13) throw new Error('Could not establish connection'); // an about: page
      },
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    browserSettings,
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...local }),
        set: async (values) => Object.assign(local, values),
      },
      sync: {
        get: async (defaults) => ({ ...defaults, ...stored }),
        set: async (values) => {
          Object.assign(stored, values);
          await browser.storage.onChanged.fire({ exclusions: { newValue: values.exclusions } }, 'sync');
        },
      },
      onChanged: event(),
    },
    action: {
      onClicked: event(),
      setBadgeBackgroundColor() {},
      setBadgeText: async ({ tabId, text }) => show(tabId, { badge: text }),
      setTitle: async ({ tabId, title }) => show(tabId, { title }),
      enable: async (tabId) => show(tabId, { enabled: true }),
      disable: async (tabId) => show(tabId, { enabled: false }),
    },
  };
  const navigator = { clipboard: { readText: async () => clipboard, writeText: async () => {} } };
  const ctx = load(SHARED, {
    browser,
    navigator,
    fetch: async (url) => ({ blob: async () => ({ url }) }),
    createImageBitmap: async (blob) => ({ from: blob.url, close() {} }),
    crypto: { randomUUID: () => `shot-${stitched.length}` },
  });
  // Joining the pictures (src/stitch.js), as a stand-in that keeps what it's given.
  ctx.Vimov.Stitcher = class {
    constructor(size) {
      Object.assign(this, { size, screens: [] });
      stitched.push(this);
    }
    draw(image, where) {
      this.screens.push({ image: image.from, ...where });
    }
    async finish() {
      return this.screens.map((_, i) => `png ${i + 1}`);
    }
  };
  ctx.Sources = {
    search,
    forText: async (text) => ({ type: 'url', url: text }),
    open: async (result, options) => opened.push([result, options]),
  };
  run(ctx, ['src/shared/stats.js', 'src/background.js']);
  return { browser, opened, sent, stored, local, button, captured, stitched };
}

// This week's Monday, as stats.js writes it.
const ctxWeek = () => load(['src/shared/stats.js']).Vimov.weekOf(new Date());

const tabResult = (url, title = url) => ({ type: 'tab', id: 7, windowId: 1, url, title });

test('address-bar suggestions from a late, older search are dropped', async () => {
  // The search for "gi" answers after the one for "git".
  const answers = {
    gi: { delay: 30, results: [tabResult('https://gitlab.example/')] },
    git: { delay: 0, results: [tabResult('https://github.com/codexjdub/vimov')] },
  };
  const { browser, opened } = setup({
    search: (text) => new Promise((resolve) => setTimeout(() => resolve(answers[text].results), answers[text].delay)),
  });
  const shown = [];
  const suggest = (text) => (suggestions) => shown.push([text, plain(suggestions).map((s) => s.content)]);
  await Promise.all([
    browser.omnibox.onInputChanged.fire('gi', suggest('gi')),
    browser.omnibox.onInputChanged.fire('git', suggest('git')),
  ]);
  assert.deepStrictEqual(shown, [['git', ['https://github.com/codexjdub/vimov']]]);

  // Picking the suggestion switches to that tab rather than loading its URL.
  await browser.omnibox.onInputEntered.fire('https://github.com/codexjdub/vimov', 'currentTab');
  assert.deepStrictEqual(plain(opened.map(([result]) => result.type)), ['tab']);
});

test('address-bar suggestions offer each URL once, as its best result', async () => {
  const first = { type: 'tab', id: 7, windowId: 1, url: 'https://example.com/', title: 'Example A' };
  const second = { type: 'tab', id: 8, windowId: 2, url: 'https://example.com/', title: 'Example B' };
  const search = { type: 'web', engine: 'Google', query: 'example', title: 'example' };
  const { browser, opened } = setup({ search: async () => [first, search, second] });
  let shown = [];
  await browser.omnibox.onInputChanged.fire('example', (suggestions) => (shown = plain(suggestions)));
  assert.deepStrictEqual(shown.map((s) => s.content), ['https://example.com/']);
  await browser.omnibox.onInputEntered.fire(shown[0].content, 'currentTab');
  assert.deepStrictEqual(opened.map(([result]) => result.id), [7]);
});

test('address-bar results opened in a background tab stay in the background', async () => {
  const result = { type: 'bookmark', url: 'https://plan.example.com/', title: 'Plan' };
  const { browser, opened } = setup({ search: async () => [result] });
  await browser.omnibox.onInputEntered.fire('plan', 'newBackgroundTab');
  await browser.omnibox.onInputEntered.fire('plan', 'newForegroundTab');
  await browser.omnibox.onInputEntered.fire('plan', 'currentTab');
  assert.deepStrictEqual(
    opened.map(([, { newTab, background }]) => [newTab, background]),
    [[true, true], [true, false], [false, false]],
  );
});

test('content-script messages resolve to { ok, result } or { error }', async () => {
  const sender = { tab: { id: 1 } };
  const ok = setup({ search: async (query) => [{ type: 'web', query }] });
  const [reply] = await ok.browser.runtime.onMessage.fire({ cmd: 'search', query: 'cats' }, sender);
  assert.deepStrictEqual(plain(reply), { ok: true, result: [{ type: 'web', query: 'cats' }] });

  const failing = setup({ search: async () => { throw new Error('history is unavailable'); } });
  const [failure] = await failing.browser.runtime.onMessage.fire({ cmd: 'search', query: 'cats' }, sender);
  assert.deepStrictEqual(plain(failure), { error: 'history is unavailable' });

  const [unknown, inherited] = await Promise.all([
    ok.browser.runtime.onMessage.fire({ cmd: 'nonsense' }, sender),
    ok.browser.runtime.onMessage.fire({ cmd: 'toString' }, sender),
  ]);
  assert.deepStrictEqual([unknown[0], inherited[0]], [undefined, undefined]);
});

test('p and P open the clipboard text, trimmed, here or in a new tab', async () => {
  const sender = { tab: { id: 1, index: 0 } };
  const { browser, opened } = setup({ clipboard: '\n https://example.org/a \n' });
  await browser.runtime.onMessage.fire({ cmd: 'openClipboard', newTab: false }, sender);
  await browser.runtime.onMessage.fire({ cmd: 'openClipboard', newTab: true }, sender);
  assert.deepStrictEqual(plain(opened.map(([result, { newTab }]) => [result.url, newTab])), [
    ['https://example.org/a', false],
    ['https://example.org/a', true],
  ]);

  const empty = setup({ clipboard: '  \n' });
  const [reply] = await empty.browser.runtime.onMessage.fire({ cmd: 'openClipboard' }, sender);
  assert.deepStrictEqual([plain(reply), empty.opened], [{ error: 'The clipboard is empty' }, []]);
});

test('gr opens Reader View only where Firefox offers it', async () => {
  const tabs = [
    { id: 1, index: 0, url: 'https://blog.example.com/post', isArticle: true },
    { id: 2, index: 1, url: 'https://app.example.com/', isArticle: false },
  ];
  const { browser, opened } = setup({ tabs });
  await browser.runtime.onMessage.fire({ cmd: 'readerView' }, { tab: tabs[0] });
  const [reply] = await browser.runtime.onMessage.fire({ cmd: 'readerView' }, { tab: tabs[1] });
  assert.deepStrictEqual(plain(opened), [['reader', 1]]);
  assert.deepStrictEqual(plain(reply), { error: 'Reader View isn’t available for this page' });
});

// Lets the listeners' own awaits settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the toolbar button turns Vimov off for a site, then back on', async () => {
  const tab = { id: 1, active: true, url: 'https://news.example.com/item?id=1' };
  const { browser, stored, button } = setup({ exclusions: 'mail.google.com j k', tabs: [tab] });

  await browser.tabs.onActivated.fire({ tabId: 1 });
  assert.deepStrictEqual(button[1], { enabled: true, badge: '', title: 'Vimov is on. Click to turn it off for news.example.com' });

  await browser.action.onClicked.fire(tab);
  await settle();
  assert.strictEqual(stored.exclusions, 'mail.google.com j k\nnews.example.com');
  assert.deepStrictEqual(button[1], { enabled: true, badge: 'off', title: 'Vimov is off for news.example.com. Click to turn it back on' });

  await browser.action.onClicked.fire(tab);
  await settle();
  assert.strictEqual(stored.exclusions, 'mail.google.com j k');
  assert.strictEqual(button[1].badge, '');
});

test('a site excluded by your own pattern opens the options instead', async () => {
  const tab = { id: 1, active: true, url: 'https://mail.google.com/mail/u/0' };
  const { browser, stored, opened, button } = setup({ exclusions: '*.google.com', tabs: [tab] });
  await browser.tabs.onActivated.fire({ tabId: 1 });
  assert.deepStrictEqual(button[1], { enabled: true, badge: 'off', title: 'Vimov is off here (“*.google.com” in excluded sites). Click to change it' });
  await browser.action.onClicked.fire(tab);
  assert.deepStrictEqual([stored.exclusions, opened], ['*.google.com', [['options']]]);
});

test('keys passed through are described, and pages Vimov can\'t run on disable the button', async () => {
  const tabs = [
    { id: 1, active: true, url: 'https://mail.google.com/' },
    { id: 2, active: true, url: 'about:addons' },
  ];
  const { browser, button } = setup({ exclusions: 'mail.google.com j k', tabs });
  await browser.runtime.onStartup.fire();
  assert.deepStrictEqual(button[1], { enabled: true, badge: '', title: 'Vimov passes j k to this page (“mail.google.com” in excluded sites). Click to change it' });
  assert.deepStrictEqual(button[2], { enabled: false, badge: '', title: 'Vimov doesn’t run on this page' });
});

test('the button follows the active tab as it navigates', async () => {
  const tab = { id: 1, active: true, url: 'https://example.com/' };
  const { browser, button } = setup({ exclusions: 'example.org', tabs: [tab] });
  await browser.tabs.onUpdated.fire(1, { url: 'https://example.org/' }, { ...tab, url: 'https://example.org/' });
  assert.strictEqual(button[1].badge, 'off');
  await browser.tabs.onUpdated.fire(1, { url: 'https://example.com/' }, tab);
  assert.strictEqual(button[1].badge, '');
});

test('a first install opens the welcome page; updates and temporary loads don\'t', async () => {
  const welcome = ['tab', 'moz-extension://vimov/src/welcome/welcome.html'];
  for (const [details, expected] of [
    [{ reason: 'install', temporary: false }, [welcome]],
    [{ reason: 'install', temporary: true }, []],
    [{ reason: 'update', temporary: false }, []],
  ]) {
    const { browser, opened, button } = setup();
    await browser.runtime.onInstalled.fire(details);
    assert.deepStrictEqual(plain(opened), expected);
    assert.strictEqual(button[1].enabled, true);
  }
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Firefox\'s tab layout is kept for content scripts, and followed as it changes', async () => {
  const setting = { value: true, onChange: event(), get: async () => ({ value: setting.value }) };
  const { local } = setup({ browserSettings: { verticalTabs: setting } });
  await tick();
  assert.strictEqual(local.firefoxVerticalTabs, true);
  setting.value = false;
  await setting.onChange.fire({ value: false });
  assert.strictEqual(local.firefoxVerticalTabs, false);
});

test('on a Firefox that can\'t tell (140 and 141), tabs count as across the top', async () => {
  const { local } = setup({ browserSettings: {} });
  await tick();
  assert.notStrictEqual(local.firefoxVerticalTabs, true);
});

test('the layout read at start is replaced when Firefox switches back', async () => {
  const setting = { value: false, onChange: event(), get: async () => ({ value: setting.value }) };
  const { local } = setup({ browserSettings: { verticalTabs: setting } });
  local.firefoxVerticalTabs = true; // kept from before Firefox switched
  await tick();
  assert.strictEqual(local.firefoxVerticalTabs, false);
  assert.strictEqual(setting.onChange.listeners.length, 1);
});

test('in Zen, tabs count as down the side, though Firefox\'s setting is off', async () => {
  const setting = { value: false, onChange: event(), get: async () => ({ value: setting.value }) };
  const zen = setup({ browserSettings: { verticalTabs: setting }, browserInfo: { name: 'Firefox', zen: { version: '1.19b' } } });
  await tick();
  assert.strictEqual(zen.local.firefoxVerticalTabs, true);
  // An older Zen, from before it said so, looks like Firefox.
  const older = setup({ browserSettings: { verticalTabs: setting }, browserInfo: { name: 'Firefox' } });
  await tick();
  assert.notStrictEqual(older.local.firefoxVerticalTabs, true);
});

const row = (n) => Array.from({ length: n }, (_, i) => ({ id: 10 + i, index: i, windowId: 1, active: i === 0 }));

test('a tab command has the tab now in front show where it is, coming from where it was', async () => {
  const tabs = row(4);
  const { browser, sent, local } = setup({ tabs });
  await browser.runtime.onMessage.fire({ cmd: 'nextTab', count: 2 }, { tab: tabs[0] });
  await browser.runtime.onMessage.fire({ cmd: 'lastTab' }, { tab: tabs[2] });
  await browser.runtime.onMessage.fire({ cmd: 'nextTab' }, { tab: tabs[3] }); // round to the first
  assert.deepStrictEqual(plain(sent), [
    [12, { cmd: 'tabPosition', from: 0, index: 2, count: 4 }, { frameId: 0 }],
    [13, { cmd: 'tabPosition', from: 2, index: 3, count: 4 }, { frameId: 0 }],
    [10, { cmd: 'tabPosition', from: 3, index: 0, count: 4 }, { frameId: 0 }],
  ]);
  assert.strictEqual(tabs.find((t) => t.active).id, 10);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(local.stats.tabs, 3);
});

test('moving a tab shows where it went, and going nowhere isn\'t a switch', async () => {
  const tabs = row(3);
  const { browser, sent, local } = setup({ tabs });
  await browser.runtime.onMessage.fire({ cmd: 'moveTab', count: 2 }, { tab: tabs[0] });
  assert.deepStrictEqual(plain(sent.pop()), [10, { cmd: 'tabPosition', from: 0, index: 2, count: 3 }, { frameId: 0 }]);
  await browser.runtime.onMessage.fire({ cmd: 'firstTab' }, { tab: tabs.find((t) => t.id === 11) });
  await browser.runtime.onMessage.fire({ cmd: 'firstTab' }, { tab: tabs.find((t) => t.id === 11) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(local.stats, undefined); // nothing counted
});

test('counts sent at once are all kept, one batch after another', async () => {
  const { browser, local } = setup();
  const sender = { tab: { id: 1 } };
  await Promise.all([
    browser.runtime.onMessage.fire({ cmd: 'tally', links: 2, px: 300 }, sender),
    browser.runtime.onMessage.fire({ cmd: 'tally', links: 1 }, sender),
    browser.runtime.onMessage.fire({ cmd: 'tally', px: 60 }, sender),
  ]);
  assert.deepStrictEqual(
    [local.stats.week, local.stats.links, local.stats.px, local.stats.tabs],
    [ctxWeek(), 3, 360, 0],
  );
});

test('a screenshot takes a picture of each screen, opens beside the page, and is kept until its tab closes', async () => {
  const { browser, captured, stitched, opened, button } = setup({ exclusions: 'example.com' });
  const tab = { id: 1, index: 0, windowId: 1, url: 'https://example.com/' };
  const send = async (message) => (await browser.runtime.onMessage.fire(message, { tab }))[0];
  const rect = { left: 0, top: 0, width: 1000, height: 800 };

  await send({ cmd: 'shotStart', width: 1000, height: 1600, title: 'A page', url: tab.url });
  await send({ cmd: 'shotTake', top: 0, rect, viewport: 1000, progress: 0.5 });
  assert.strictEqual(button[1].badge, '50%');
  await send({ cmd: 'shotTake', top: 800, rect, viewport: 1000, progress: 1 });
  assert.deepStrictEqual(plain(captured), [[1, { format: 'png' }], [1, { format: 'png' }]]);
  assert.deepStrictEqual(plain(stitched[0].size), { width: 1000, height: 1600 });
  assert.deepStrictEqual(stitched[0].screens.map((s) => s.top), [0, 800]);
  assert.strictEqual(stitched[0].screens[0].image, 'data:image/png;base64,screen');

  assert.strictEqual((await send({ cmd: 'shotFinish' })).ok, true);
  const [[, url, index]] = opened;
  assert.strictEqual(url, 'moz-extension://vimov/src/shot/shot.html#shot-1');
  assert.strictEqual(index, 1); // just after the page
  assert.strictEqual(button[1].badge, 'off'); // the button says what it said before

  const shown = await send({ cmd: 'shotResult', id: 'shot-1' });
  assert.deepStrictEqual(plain(shown.result.parts), ['png 1', 'png 2']);
  assert.strictEqual(shown.result.title, 'A page');
  await browser.tabs.onRemoved.fire(101); // the tab showing it closes
  assert.strictEqual((await send({ cmd: 'shotResult', id: 'shot-1' })).result, null);
});

test('a screenshot stops when its tab leaves the front, and a refused picture reads plainly', async () => {
  const tabs = [{ id: 1, index: 0, windowId: 1, active: false, url: 'https://example.com/' }];
  const away = setup({ tabs });
  const tab = tabs[0];
  const rect = { left: 0, top: 0, width: 1000, height: 800 };
  const take = { cmd: 'shotTake', top: 0, rect, viewport: 1000, progress: 1 };
  await away.browser.runtime.onMessage.fire({ cmd: 'shotStart', width: 1000, height: 800 }, { tab });
  const [moved] = await away.browser.runtime.onMessage.fire(take, { tab });
  assert.strictEqual(moved.error, 'Screenshot stopped: its tab went to the background');
  assert.strictEqual(away.captured.length, 0);

  const refused = setup({ capture: async () => { throw new Error('Missing activeTab permission'); } });
  const front = { id: 1, index: 0, windowId: 1 };
  await refused.browser.runtime.onMessage.fire({ cmd: 'shotStart', width: 1000, height: 800 }, { tab: front });
  const [reply] = await refused.browser.runtime.onMessage.fire(take, { tab: front });
  assert.strictEqual(reply.error, 'Firefox didn’t let Vimov take a picture of this page');

  // One stopped from the page is dropped.
  await refused.browser.runtime.onMessage.fire({ cmd: 'shotCancel' }, { tab: front });
  const [after] = await refused.browser.runtime.onMessage.fire(take, { tab: front });
  assert.strictEqual(after.error, 'Screenshot stopped');
});

test('from an iframe, a screenshot is taken in the top frame', async () => {
  const { browser, sent } = setup();
  await browser.runtime.onMessage.fire({ cmd: 'startScreenshot' }, { tab: { id: 1 } });
  assert.deepStrictEqual(plain(sent), [[1, { cmd: 'screenshot' }, { frameId: 0 }]]);
});
