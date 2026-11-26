'use strict';

// src/content/hints.js: hint labels, where they go, and how markers are kept
// from covering each other.

const test = require('node:test');
const assert = require('node:assert');
const { load, plain } = require('./helpers');

const { Vimov } = load(['src/content/hints.js'], { Vimov: {}, innerWidth: 1000 });

test('labels are prefix-free and earlier elements get the shorter ones', () => {
  assert.deepStrictEqual(plain(Vimov.hints.makeLabels(1, 'ab')), ['a']);
  assert.deepStrictEqual(plain(Vimov.hints.makeLabels(3, 'ab')), ['b', 'aa', 'ab']);
  const labels = Vimov.hints.makeLabels(50, 'sadfjkl');
  assert.strictEqual(new Set(labels).size, 50);
  for (const a of labels) for (const b of labels) assert(a === b || !b.startsWith(a), `${a} is a prefix of ${b}`);
});

const box = (left, top, width = 20, height = 14) => ({ left, top, width, height });

test('a marker that would cover an earlier one moves right past it', () => {
  // A 10px vote arrow, then the title link 12px further on.
  assert.deepStrictEqual(plain(Vimov.hints.spread([box(40, 100), box(52, 100)])), [40, 61]);
});

test('markers at the same corner end up side by side', () => {
  assert.deepStrictEqual(plain(Vimov.hints.spread([box(10, 10), box(10, 10), box(10, 10)])), [10, 31, 52]);
});

test('markers that don\'t touch stay put, including ones on other rows', () => {
  assert.deepStrictEqual(plain(Vimov.hints.spread([box(0, 0), box(30, 0), box(0, 20), box(5, 40)])), [0, 30, 0, 5]);
});

test('markers further along the row move on in turn', () => {
  // The second marker moves to 21, which puts it over the third, so the
  // third moves to 42.
  assert.deepStrictEqual(plain(Vimov.hints.spread([box(0, 0), box(10, 0), box(30, 0)])), [0, 21, 42]);
});

// Targets as hints.js collects them, and the size of a one-letter label.
const link = (left, right, top = 50, bottom = 70, more = {}) => ({ el: { contains: () => false }, rect: { left, right, top, bottom }, rtl: false, ...more });
const size = { width: 16, height: 15 };
const place = (targets) => plain(Vimov.hints.place(targets, targets.map(() => size))).map(({ left, top }) => [left, top]);

test('a label goes just before its link, level with its first line', () => {
  assert.deepStrictEqual(place([link(100, 180)]), [[82, 52.5]]);
  // Text that runs right to left starts on the right.
  assert.deepStrictEqual(place([link(100, 180, 50, 70, { rtl: true })]), [[182, 52.5]]);
});

test('a tall element has its label level with its top', () => {
  assert.deepStrictEqual(place([link(100, 400, 50, 350)]), [[82, 62.5]]);
});

test('between two links close together, a label comes in only as far as it must', () => {
  // Tags 6px apart: the second label stops just past the first tag, covering
  // 11px of its own and none of the first.
  assert.deepStrictEqual(place([link(100, 160), link(166, 220)]), [[82, 52.5], [161, 52.5]]);
});

test('at the screen\'s edge a label stops at the edge, and never goes past its own corner', () => {
  assert.deepStrictEqual(place([link(5, 80)]), [[0, 52.5]]);
  // Another element over this one's start: the corner, as before.
  assert.deepStrictEqual(place([link(100, 175), link(166, 220)])[1], [166, 52.5]);
});

test('a link inside a clickable card still gets its label just before it', () => {
  const inner = link(100, 180);
  const card = link(50, 500, 0, 300, { el: { contains: (el) => el === inner.el } });
  assert.deepStrictEqual(place([card, inner])[1], [82, 52.5]);
});
