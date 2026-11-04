'use strict';

// src/content/main.js: routing key presses, with the DOM and the page
// replaced by stand-ins.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run, event } = require('./helpers');

async function setup() {
  const listeners = {};
  const body = { localName: 'body' };
  const field = { localName: 'input', blur() {} };
  const page = { active: body };
  const ran = [];
  const ctx = load(SHARED, {
    browser: {
      storage: { sync: { get: async (defaults) => defaults }, onChanged: event() },
      runtime: { onMessage: event(), sendMessage: async () => ({}) },
    },
    location: { href: 'https://example.com/' },
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
  });
  ctx.Vimov.ui = { setStatus() {}, message() {} };
  ctx.Vimov.dom = { deepActiveElement: () => page.active, isEditable: (el) => el === field };
  ctx.Vimov.find = { clear: () => false };
  run(ctx, ['src/content/core.js']);
  // Every command just records that it ran, with its count.
  ctx.Vimov.actions = new Proxy({}, { get: (_, command) => (n) => ran.push(`${command}:${n}`) });
  run(ctx, ['src/content/main.js']);
  await new Promise((resolve) => setTimeout(resolve, 0)); // settings load

  const fire = (type, key, code, { shiftKey = false } = {}) => {
    const e = {
      type, key, code, shiftKey, isTrusted: true, isComposing: false, repeat: false,
      altKey: false, ctrlKey: false, metaKey: false, getModifierState: () => false,
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
    };
    for (const fn of listeners[type] || []) fn(e);
    return e;
  };
  const press = (key, code, options) => [fire('keydown', key, code, options), fire('keypress', key, code, options), fire('keyup', key, code, options)];
  return { fire, press, page, body, field, ran };
}

test('a mapped key runs its command and is hidden from the page', async () => {
  const { press, ran } = await setup();
  const [down, keypress, up] = press('j', 'KeyJ');
  assert.deepStrictEqual(ran, ['scrollDown:1']);
  assert.deepStrictEqual([down.prevented, keypress.prevented, up.stopped], [true, true, true]);
});

test('counts and sequences', async () => {
  const { press, ran } = await setup();
  press('5', 'Digit5');
  press('j', 'KeyJ');
  press('g', 'KeyG');
  press('g', 'KeyG');
  assert.deepStrictEqual(ran, ['scrollDown:5', 'scrollToTop:1']);
});

test('typing in a text field reaches the page', async () => {
  const { press, page, field, ran } = await setup();
  page.active = field;
  const [down, keypress] = press('j', 'KeyJ');
  assert.deepStrictEqual(ran, []);
  assert.deepStrictEqual([down.prevented, keypress.prevented, keypress.stopped], [false, false, false]);
});

test('a key whose keyup went to another tab doesn\'t swallow its next press', async () => {
  const { fire, page, field, ran } = await setup();
  // K switches tabs on keydown, so its keyup lands in the other tab.
  fire('keydown', 'K', 'KeyK', { shiftKey: true });
  assert.deepStrictEqual(ran, ['nextTab:1']);
  // Back on this page, typing k in a text field.
  page.active = field;
  const down = fire('keydown', 'k', 'KeyK');
  const keypress = fire('keypress', 'k', 'KeyK');
  assert.deepStrictEqual([down.prevented, keypress.prevented, keypress.stopped], [false, false, false]);
});
