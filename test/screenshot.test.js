'use strict';

// src/content/screenshot.js: scrolling through the page for a screenshot,
// with a stand-in page and background page.

const test = require('node:test');
const assert = require('node:assert');
const { load, run, plain } = require('./helpers');

// An element's inline style, enough to hide it and put it back.
function inlineStyle(initial = {}) {
  const props = { ...initial };
  return {
    props,
    setProperty: (name, value, priority = '') => (props[name] = [value, priority]),
    getPropertyValue: (name) => props[name]?.[0] || '',
    getPropertyPriority: (name) => props[name]?.[1] || '',
    removeProperty: (name) => delete props[name],
  };
}

// Something that scrolls: the page, or an element in it.
function scroller({ height = 3000, view = 800, width = 1000, ...rest } = {}) {
  return {
    nodeType: 1, isConnected: true, scrollTop: 0, scrollHeight: height, clientHeight: view, clientWidth: width,
    clientLeft: 0, clientTop: 0,
    scrollTo({ top }) {
      this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
    },
    ...rest,
  };
}

function setup({ page = scroller(), elements = [] } = {}) {
  const listeners = {};
  const sent = [];
  const shown = { hidden: false, messages: [] };
  let mode = null;
  let reply = () => ({ ok: true });
  const location = { href: 'https://example.com/home' };
  const document = {
    images: [],
    hidden: false,
    querySelectorAll: () => elements,
    addEventListener() {},
    removeEventListener() {},
  };
  const ctx = load([], {
    Vimov: {
      ui: { owns: () => false, setHidden: (hidden) => (shown.hidden = hidden), message: (text) => shown.messages.push(text) },
      scroll: { docScroller: () => page, target: () => page },
      mode: {
        get current() { return mode; },
        enter: (m) => (mode = m),
        exit: (m) => mode === m && (mode = null),
      },
    },
    location,
    document,
    browser: {
      runtime: {
        sendMessage: async (message) => {
          // What the page looked like when each message went.
          sent.push({ ...message, uiHidden: shown.hidden, at: page.scrollTop,
            styles: elements.map((el) => el.style.getPropertyValue('visibility')) });
          return reply(message, sent);
        },
      },
    },
    getComputedStyle: (el) => el.computed,
    innerWidth: 1000,
    innerHeight: 800,
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => setImmediate(fn),
    setTimeout: (fn) => setImmediate(fn),
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    removeEventListener: (type, fn) => (listeners[type] = (listeners[type] || []).filter((f) => f !== fn)),
  });
  ctx.window = ctx;
  ctx.top = ctx;
  run(ctx, ['src/content/screenshot.js']);
  // The user scrolling `el` (the page by default) to `top`.
  const scrollTo = (top, el = page) => {
    el.scrollTop = top;
    for (const fn of listeners.scroll) fn({ target: el === page ? document : el });
  };
  const take = () => ctx.Vimov.screenshot.start();
  const cmds = () => sent.map((m) => m.cmd);
  return { page, sent, shown, scrollTo, take, cmds, location, mode: () => mode, onReply: (fn) => (reply = fn) };
}

test('a screenshot goes from the top down to as far as you’ve scrolled, then puts the page back', async () => {
  const { page, sent, shown, scrollTo, take, cmds, mode } = setup();
  scrollTo(2000);
  scrollTo(500); // back up a little to read something
  await take();
  assert.deepStrictEqual(cmds(), ['shotStart', 'shotTake', 'shotTake', 'shotTake', 'shotTake', 'shotFinish']);
  assert.strictEqual(sent[0].height, 2800);
  assert.strictEqual(sent[0].width, 1000);
  const takes = sent.filter((m) => m.cmd === 'shotTake');
  // The last screen can't go below the page's end, so it starts at 2200.
  assert.deepStrictEqual(takes.map((m) => m.top), [0, 800, 1600, 2200]);
  assert.deepStrictEqual(takes.map((m) => Math.round(m.progress * 100)), [29, 57, 86, 100]);
  assert.deepStrictEqual(plain(takes[0].rect), { left: 0, top: 0, width: 1000, height: 800 });
  assert.ok(takes.every((m) => m.uiHidden)); // Vimov's own pieces aren't in the pictures
  assert.strictEqual(page.scrollTop, 500);
  assert.strictEqual(shown.hidden, false);
  assert.strictEqual(mode(), null);
  assert.strictEqual(shown.messages.at(-1), 'The screenshot is in the next tab');
});

test('parts that stay put show on the first screen only, and are put back after', async () => {
  const el = (position, extra = {}) => ({ computed: { position }, style: inlineStyle(), contains: () => false, ...extra });
  const page = scroller({ height: 2400 });
  const bar = el('fixed');
  const header = el('sticky', { style: inlineStyle({ visibility: ['visible', ''] }) });
  const text = el('static');
  const shell = el('fixed', { contains: (node) => node === page }); // the page scrolls inside it
  const { sent, scrollTo, take } = setup({ page, elements: [bar, header, text, shell] });
  scrollTo(1600);
  await take();
  const takes = sent.filter((m) => m.cmd === 'shotTake');
  assert.deepStrictEqual(takes.map((m) => m.styles), [
    ['', 'visible', '', ''],
    ['hidden', 'hidden', '', ''],
    ['hidden', 'hidden', '', ''],
  ]);
  assert.deepStrictEqual(bar.style.props, {});
  assert.deepStrictEqual(header.style.props, { visibility: ['visible', ''] });
});

test('Esc stops a screenshot partway, and nothing opens', async () => {
  const { page, shown, scrollTo, take, cmds, mode, onReply } = setup();
  scrollTo(2000);
  onReply((message, sent) => {
    if (sent.filter((m) => m.cmd === 'shotTake').length === 2) mode().onKey('<esc>');
    return { ok: true };
  });
  await take();
  assert.deepStrictEqual(cmds(), ['shotStart', 'shotTake', 'shotTake', 'shotCancel']);
  assert.strictEqual(shown.messages.at(-1), 'Screenshot stopped');
  assert.strictEqual(page.scrollTop, 2000);
  assert.strictEqual(shown.hidden, false);
});

test('a picture the background page couldn’t take stops it and says why', async () => {
  const { shown, scrollTo, take, cmds, onReply } = setup();
  scrollTo(2000);
  const refused = 'Firefox didn’t let Vimov take a picture of this page';
  onReply((message) => (message.cmd === 'shotTake' ? { error: refused } : { ok: true }));
  await take();
  assert.deepStrictEqual(cmds(), ['shotStart', 'shotTake', 'shotCancel']);
  assert.strictEqual(shown.messages.at(-1), refused);
});

test('going to another address starts the distance over', async () => {
  const { sent, scrollTo, take, location } = setup();
  scrollTo(2000);
  scrollTo(0);
  location.href = 'https://example.com/status/1'; // a single-page app moving on
  await take();
  assert.strictEqual(sent[0].height, 800); // just the screen you're on
});

test('of the scrollers moved, the largest is taken, and only its part of the screen', async () => {
  const page = scroller({ height: 800 }); // the page itself doesn't scroll
  const column = scroller({ height: 5000, view: 600, width: 700, getBoundingClientRect: () => ({ left: 200, top: 100 }) });
  const menu = scroller({ height: 900, view: 300, width: 200 });
  const { sent, scrollTo, take } = setup({ page });
  scrollTo(1000, column);
  scrollTo(400, menu);
  await take();
  assert.deepStrictEqual([sent[0].width, sent[0].height], [700, 1600]);
  assert.deepStrictEqual(plain(sent[1].rect), { left: 200, top: 100, width: 700, height: 600 });
  assert.strictEqual(column.scrollTop, 1000);
});
