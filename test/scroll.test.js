'use strict';

// src/content/scroll.js gliding, and the scroll commands in actions.js that
// use it, with a fake page and animation frames driven by hand.

const test = require('node:test');
const assert = require('node:assert');
const { load, run } = require('./helpers');

// A scrolling box: the page, or an element with `overflow` (auto, hidden…).
function box({ height = 20000, overflow = 'visible', ...rest } = {}) {
  return {
    isConnected: true, nodeType: 1,
    scrollTop: 0, scrollHeight: height, clientHeight: 800,
    scrollLeft: 0, scrollWidth: 1000, clientWidth: 1000,
    computed: { overflowX: overflow, overflowY: overflow },
    scrollBy({ top = 0, left = 0 }) {
      this.scrollTop += top;
      this.scrollLeft += left;
    },
    scrollTo() {},
    ...rest,
  };
}

function setup({ page = box(), elements = [] } = {}) {
  const listeners = {};
  let frames = new Map();
  let nextFrame = 1;
  let now = 0;
  const ctx = load([], {
    Vimov: {
      dom: { deepActiveElement: () => null, deepElementFromPoint: () => null, flatParent: () => null },
      ui: { owns: (node) => node?.vimov === true },
    },
    document: { scrollingElement: page, documentElement: page, body: box({ height: 0 }), querySelectorAll: () => elements },
    getComputedStyle: (el) => el.computed,
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

const pressed = (node) => ({ isTrusted: true, composedPath: () => [node] });

test('scrolling starts where focus moved after the last click', () => {
  const modal = box({ height: 3000, overflow: 'auto' });
  const button = box({ height: 0 });
  const { ctx, page, fire } = setup();
  fire('mousedown', pressed(button));
  fire('focusin', pressed(modal)); // the modal the button opened focuses itself
  ctx.Vimov.scroll.by('y', { px: 60 }, false);
  assert.deepStrictEqual([modal.scrollTop, page.scrollTop], [60, 0]);
  // Vimov's own boxes taking focus don't move where scrolling starts.
  fire('focusin', pressed({ vimov: true, isConnected: true, nodeType: 1 }));
  ctx.Vimov.scroll.by('y', { px: 60 }, false);
  assert.deepStrictEqual([modal.scrollTop, page.scrollTop], [120, 0]);
});

test('a page locked with overflow: hidden isn\'t scrolled', () => {
  const page = box({ overflow: 'hidden' });
  const modal = box({ height: 3000, overflow: 'auto' });
  const button = box({ height: 0 });
  // The click was on the page behind; the largest scroller left is the modal.
  const first = setup({ page, elements: [button, modal] });
  first.fire('mousedown', pressed(button));
  first.ctx.Vimov.scroll.by('y', { px: 60 }, false);
  first.ctx.Vimov.scroll.to('y', true, false);
  assert.deepStrictEqual([modal.scrollTop, page.scrollTop], [60, 0]);
  // With nothing else to scroll, nothing moves.
  const second = setup({ page });
  second.ctx.Vimov.scroll.by('y', { px: 60 }, false);
  second.ctx.Vimov.scroll.glide('y', 1, 900, 'KeyJ');
  second.frame(10);
  assert.deepStrictEqual([page.scrollTop, second.pending()], [0, 0]);
});
