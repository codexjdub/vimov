'use strict';

// src/content/scroll.js: pressing and holding a line scroll key, and the
// scroll commands in actions.js that use it, with a fake page and animation
// frames driven by hand.

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

const J = { distance: 60, speed: 900, code: 'KeyJ' };

// How far the page moves on each of `count` frames.
function moves(frame, page, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const before = page.scrollTop;
    frame();
    list.push(page.scrollTop - before);
  }
  return list;
}
const sum = (list) => list.reduce((a, b) => a + b, 0);

test('a press moves exactly one step, eased', () => {
  const { ctx, page, frame, fire, pending } = setup();
  ctx.Vimov.scroll.press('y', 1, J);
  frame(3); // 50 ms, a quick tap
  fire('keyup', { code: 'KeyJ' });
  assert(page.scrollTop > 0 && page.scrollTop < 60, `at ${page.scrollTop}px after 50 ms`);
  while (pending()) frame();
  assert.strictEqual(page.scrollTop, 60);
});

test('held, the step carries straight on into a glide that builds up to a steady speed', () => {
  const { ctx, page, frame } = setup();
  ctx.Vimov.scroll.press('y', 1, J);
  const list = moves(frame, page, 90);
  // No frame stands still, as it did while the key waited to repeat.
  assert(list.every((px) => px > 0), list.join(' '));
  // A second and a half in, it's at 900px a second.
  assert(Math.abs(sum(list.slice(-30)) - 450) <= 3, `${sum(list.slice(-30))}px in the last half second`);
});

test('letting go eases to a stop over about a step, and only its own key lets go', () => {
  const { ctx, page, frame, fire, pending } = setup();
  ctx.Vimov.scroll.press('y', 1, J);
  frame(60);
  fire('keyup', { code: 'KeyF' });
  assert(sum(moves(frame, page, 1)) >= 14, 'still at full speed');
  fire('keyup', { code: 'KeyJ' });
  const after = [];
  while (pending()) after.push(...moves(frame, page, 1));
  assert(after[0] <= 15, `${after[0]}px on the first frame`);
  for (let i = 1; i < after.length; i++) assert(after[i] <= after[i - 1] + 1, `speeds up: ${after.join(' ')}`);
  assert(sum(after) > 40 && sum(after) < 80, `${sum(after)}px after letting go`);
});

test('the page losing focus counts as letting go', () => {
  const { ctx, frame, fire, pending } = setup();
  ctx.Vimov.scroll.press('y', 1, J);
  frame(30);
  fire('blur');
  for (let i = 0; i < 60 && pending(); i++) frame();
  assert.strictEqual(pending(), 0);
});

test('repeats of the held key keep the one glide going', () => {
  const plain = setup();
  plain.ctx.Vimov.scroll.press('y', 1, J);
  plain.frame(60);
  const { ctx, page, frame, pending } = setup();
  ctx.Vimov.scroll.press('y', 1, J);
  frame(30);
  ctx.Vimov.scroll.press('y', 1, { ...J, distance: 0 });
  ctx.Vimov.scroll.press('y', 1, { ...J, distance: 0 });
  assert.strictEqual(pending(), 1);
  frame(30);
  assert.strictEqual(page.scrollTop, plain.page.scrollTop);
});

test('a key repeat with no glide going glides at once', () => {
  const { ctx, page, frame } = setup();
  ctx.Vimov.scroll.press('y', 1, { ...J, distance: 0 });
  const list = moves(frame, page, 30);
  assert(list.slice(3).every((px) => px > 0) && sum(list) > 150, list.join(' '));
});

test('pressing the other way turns the scroll around', () => {
  const { ctx, page, frame } = setup();
  ctx.Vimov.scroll.press('y', 1, J);
  frame(60);
  ctx.Vimov.scroll.press('y', -1, { ...J, code: 'KeyK' });
  frame(60);
  assert(Math.abs(sum(moves(frame, page, 30)) + 450) <= 3);
});

test('slow glides add up fractions of a pixel', () => {
  const { ctx, page, frame } = setup();
  ctx.Vimov.scroll.press('y', 1, { distance: 0, speed: 30, code: 'KeyJ' }); // half a pixel a frame
  frame(60);
  assert(Math.abs(sum(moves(frame, page, 60)) - 30) <= 1);
});

test('at the end of the page, a press the other way moves at once', () => {
  const page = box({ height: 1000 });
  page.scrollBy = function ({ top = 0 }) {
    this.scrollTop = Math.min(Math.max(this.scrollTop + top, 0), this.scrollHeight - this.clientHeight);
  };
  const { ctx, frame, fire, pending } = setup({ page });
  ctx.Vimov.scroll.press('y', 1, J);
  frame(60); // held well past the end
  fire('keyup', { code: 'KeyJ' });
  while (pending()) frame();
  assert.strictEqual(page.scrollTop, 200);
  ctx.Vimov.scroll.press('y', -1, { ...J, code: 'KeyK' });
  frame();
  assert(page.scrollTop < 200, 'moved up on the first frame');
  fire('keyup', { code: 'KeyK' });
  while (pending()) frame();
  assert.strictEqual(page.scrollTop, 140);
});

test('scroll commands press to step and glide, or jump with smooth scrolling off', () => {
  const calls = [];
  const ctx = load([], {
    Vimov: {
      dom: {}, ui: {},
      state: { settings: { scrollStep: 60, smoothScroll: true } },
      scroll: {
        by: (axis, amount, smooth) => calls.push(['by', axis, amount.px, smooth]),
        press: (axis, dir, { distance, speed, code }) => calls.push(['press', axis, dir, distance, speed, code]),
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
    ['press', 'y', 1, 180, 900, 'KeyJ'],
    ['press', 'y', 1, 0, 900, 'KeyJ'],
    ['press', 'x', -1, 0, 900, 'KeyH'],
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
  second.ctx.Vimov.scroll.press('y', 1, J);
  second.frame(10);
  assert.deepStrictEqual([page.scrollTop, second.pending()], [0, 0]);
});
