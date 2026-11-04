'use strict';

// src/content/hints.js: hint labels and how markers are kept from covering
// each other.

const test = require('node:test');
const assert = require('node:assert');
const { load, plain } = require('./helpers');

const { Vimov } = load(['src/content/hints.js'], { Vimov: {} });

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
