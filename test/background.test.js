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
} = {}) {
  const opened = [];
  const stored = { exclusions };
  const button = {}; // tab id → { enabled, badge, title }
  const show = (tabId, change) => (button[tabId] = { ...button[tabId], ...change });
  const browser = {
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event(), openOptionsPage: async () => opened.push(['options']) },
    omnibox: { setDefaultSuggestion() {}, onInputChanged: event(), onInputEntered: event() },
    tabs: {
      query: async () => tabs,
      get: async (id) => tabs.find((t) => t.id === id),
      toggleReaderMode: async (id) => opened.push(['reader', id]),
      onActivated: event(),
      onUpdated: event(),
    },
    storage: {
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
  const ctx = load(SHARED, { browser, navigator });
  ctx.Sources = {
    search,
    forText: async (text) => ({ type: 'url', url: text }),
    open: async (result, options) => opened.push([result, options]),
  };
  run(ctx, ['src/background.js']);
  return { browser, opened, stored, button };
}

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
