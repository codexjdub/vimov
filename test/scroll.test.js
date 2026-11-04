'use strict';

// src/content/scroll.js gliding, and the scroll commands in actions.js that
// use it, with a fake page and animation frames driven by hand.

const test = require('node:test');
const assert = require('node:assert');
const { load, run } = require('./helpers');

function setup() {
  const page = {
    scrollTop: 0, scrollHeight: 20000, clientHeight: 800,
    scrollLeft: 0, scrollWidth: 1000, clientWidth: 1000,
    scrollBy({ top = 0, left = 0 }) {
      this.scrollTop += top;
      this.scrollLeft += left;
    },
    scrollTo() {},
  };
  const listeners = {};
  let frames = new Map();
  let nextFrame = 1;
  let now = 0;
  const ctx = load([], {
    Vimov: { dom: { deepActiveElement: () => null, deepElementFromPoint: () => null, flatParent: () => null } },
    document: { scrollingElement: page, documentElement: page, body: {}, querySelectorAll: () => [] },
    getComputedStyle: () => ({ overflowX: 'visible', overflowY: 'visible' }),
    innerWidth: 1000,
    innerHeight: 800,
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    requestAnimationFrame: (fn) => {
      frames.set(nextFrame, fn);
      return nextFrame++;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  run(ctx, ['src/content/scroll.js']);

  // Runs `count` animation frames `ms` apart.
  const frame = (count = 1, ms = 1000 / 60) => {
    for (let i = 0; i < count; i++) {
      now += ms;
      const due = [...frames.values()];
      frames = new Map();
      for (const fn of due) fn(now);
    }
  };
  const fire = (type, event = {}) => (listeners[type] || []).forEach((fn) => fn(event));
  return { ctx, page, frame, fire, pending: () => frames.size };
}

test('a held key glides at a steady speed', () => {
  const { ctx, page, frame } = setup();
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  frame(60); // one second
  assert(Math.abs(page.scrollTop - 900) <= 2, `scrolled ${page.scrollTop}px`);
});

test('repeats of the same key keep the one glide going', () => {
  const { ctx, page, frame, pending } = setup();
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  frame(30);
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  assert.strictEqual(pending(), 1);
  frame(30);
  assert(Math.abs(page.scrollTop - 900) <= 2, `scrolled ${page.scrollTop}px`);
});

test('the glide stops when its key comes up, not another', () => {
  const { ctx, page, frame, fire, pending } = setup();
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  frame(10);
  fire('keyup', { code: 'KeyF' });
  assert.strictEqual(pending(), 1);
  fire('keyup', { code: 'KeyJ' });
  const stoppedAt = page.scrollTop;
  frame(30);
  assert.deepStrictEqual([pending(), page.scrollTop], [0, stoppedAt]);
});

test('the glide stops when the page loses focus', () => {
  const { ctx, frame, fire, pending } = setup();
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  frame(5);
  fire('blur');
  assert.strictEqual(pending(), 0);
});

test('holding another key hands the glide over', () => {
  const { ctx, page, frame, pending } = setup();
  ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  frame(60);
  ctx.Vimov.scroll.glide('y', -1, 900, 'KeyK');
  assert.strictEqual(pending(), 1);
  frame(30);
  assert(Math.abs(page.scrollTop - 450) <= 3, `at ${page.scrollTop}px`);
});

test('slow glides add up fractions of a pixel', () => {
  const { ctx, page, frame } = setup();
  ctx.Vimov.scroll.glide('y', 1, 30, 'KeyJ'); // half a pixel a frame
  frame(60);
  assert(Math.abs(page.scrollTop - 30) <= 1, `scrolled ${page.scrollTop}px`);
});

test('scroll commands step on a press and glide while held', () => {
  const calls = [];
  const ctx = load([], {
    Vimov: {
      dom: {}, ui: {},
      state: { settings: { scrollStep: 60, smoothScroll: true } },
      scroll: {
        by: (axis, amount, smooth) => calls.push(['by', axis, amount.px, smooth]),
        glide: (axis, dir, speed, code) => calls.push(['glide', axis, dir, speed, code]),
      },
    },
  });
  run(ctx, ['src/content/actions.js']);
  const { actions, state } = ctx.Vimov;
  actions.scrollDown(3, {}, { repeat: false, code: 'KeyJ' });
  actions.scrollDown(1, {}, { repeat: true, code: 'KeyJ' });
  actions.scrollLeft(1, {}, { repeat: true, code: 'KeyH' });
  state.settings.smoothScroll = false;
  actions.scrollUp(1, {}, { repeat: true, code: 'KeyK' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [
    ['by', 'y', 180, true],
    ['glide', 'y', 1, 900, 'KeyJ'],
    ['glide', 'x', -1, 900, 'KeyH'],
    ['by', 'y', -60, false],
  ]);
});
