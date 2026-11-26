'use strict';

// src/shared/stats.js: "Your week with Vimov", week by week.

const test = require('node:test');
const assert = require('node:assert');
const { load, plain } = require('./helpers');

const { Vimov } = load(['src/shared/stats.js']);
const day = (text) => new Date(`${text}T12:00`);

test('weeks start on Monday, in local time', () => {
  assert.strictEqual(Vimov.weekOf(day('2026-11-23')), '2026-11-23'); // a Monday
  assert.strictEqual(Vimov.weekOf(day('2026-11-26')), '2026-11-23');
  assert.strictEqual(Vimov.weekOf(day('2026-11-29')), '2026-11-23'); // the Sunday after
  assert.strictEqual(Vimov.weekOf(new Date(2026, 10, 30, 0, 0, 1)), '2026-11-30');
  // Across a new year.
  assert.strictEqual(Vimov.weekOf(day('2027-01-01')), '2026-12-28');
});

test('counts add up through the week, then start again, keeping last week', () => {
  let stats = Vimov.addTally(null, { links: 1 }, day('2026-11-23'));
  stats = Vimov.addTally(stats, { px: 600, tabs: 2 }, day('2026-11-26'));
  stats = Vimov.addTally(stats, { links: 2, cmd: 'tally', count: 1 }, day('2026-11-29'));
  assert.deepStrictEqual(plain(stats), { week: '2026-11-23', links: 3, px: 600, tabs: 2, last: null });

  stats = Vimov.addTally(stats, { tabs: 1 }, day('2026-12-01'));
  assert.deepStrictEqual(plain(stats), {
    week: '2026-11-30', links: 0, px: 0, tabs: 1, last: { links: 3, px: 600, tabs: 2 },
  });
  // A week with nothing counted in between leaves no last week.
  assert.deepStrictEqual(plain(Vimov.statsFor(stats, day('2026-12-16'))), {
    week: '2026-12-14', links: 0, px: 0, tabs: 0, last: null,
  });
  // Shown the week after, this week's counts are last week's.
  assert.deepStrictEqual(plain(Vimov.statsFor(stats, day('2026-12-07')).last), { links: 0, px: 0, tabs: 1 });
});

test('odd stored values count as nothing', () => {
  const stats = { week: '2026-11-23', links: 'lots', px: -5, tabs: 4, last: null };
  assert.deepStrictEqual(plain(Vimov.addTally(stats, { links: 1 }, day('2026-11-24'))), {
    week: '2026-11-23', links: 1, px: 0, tabs: 4, last: null,
  });
});

test('distances read in cm, m or km, pictured by something that size', () => {
  assert.strictEqual(Vimov.formatDistance(Vimov.pxToMeters(1000)), '26 cm');
  assert.strictEqual(Vimov.formatDistance(120.4), '120 m');
  assert.strictEqual(Vimov.formatDistance(1254), '1.25 km');
  assert.strictEqual(Vimov.formatDistance(18320), '18.3 km');
  assert.strictEqual(Vimov.distanceLike(12), '');
  assert.strictEqual(Vimov.distanceLike(31), 'That’s a blue whale, nose to tail.');
  assert.strictEqual(Vimov.distanceLike(800), 'That’s the height of the Burj Khalifa.');
  assert.strictEqual(Vimov.distanceLike(700), 'That’s 2.1 Eiffel Towers.');
  assert.strictEqual(Vimov.distanceLike(990), 'That’s 1.2 Burj Khalifas.');
  assert.strictEqual(Vimov.distanceLike(84390), 'That’s 2 marathons.');
});
