'use strict';

// src/content/command.js: what a command line runs, and what Tab offers.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run, plain } = require('./helpers');

const ctx = run(load(SHARED), ['src/content/command.js']);
const { resolve, complete } = ctx.Vimov.commandLine;
const ran = (text) => plain(resolve(text));

test('commands run by name, with options as in a keymap line', () => {
  assert.deepStrictEqual(ran('scrollToTop'), { command: 'scrollToTop', options: {}, count: 1 });
  assert.deepStrictEqual(ran(':reload hard=true'), { command: 'reload', options: { hard: true }, count: 1 });
  // Case doesn't matter, as long as there's no exact match.
  assert.strictEqual(ran('  scrolltotop ').command, 'scrollToTop');
  assert.deepStrictEqual(ran('linkHints action=bogus'), {
    error: 'action must be one of: click, newTab, newTabFg, copyUrl, hover, focus',
  });
  assert.deepStrictEqual(ran('openUrl'), { error: 'openUrl needs url=…' });
});

test('Vim words do what they would in a browser', () => {
  const command = (text) => ran(text).command;
  assert.deepStrictEqual(['q', 'quit', 'wq', 'x', 'tabc'].map(command), Array(5).fill('closeTab'));
  assert.deepStrictEqual(['tabn', 'tabN', 'tabfir', 'tabl', 'u', 'h', 'set'].map(command), [
    'nextTab', 'previousTab', 'firstTab', 'lastTab', 'restoreTab', 'showHelp', 'openOptions',
  ]);
  assert.deepStrictEqual(ran('e'), { command: 'reload', options: {}, count: 1 });
  assert.deepStrictEqual(ran('e!').options, { hard: true });
  assert.deepStrictEqual(ran('tabnew'), { command: 'newTab', options: {}, count: 1 });
  assert.deepStrictEqual(ran('tabe example.com').options, { url: 'example.com', newTab: true });
  assert.deepStrictEqual(ran('o example.com').options, { url: 'example.com', newTab: false });
  assert.deepStrictEqual(ran('b mail inbox').options, { in: 'tabs', query: 'mail inbox' });
  assert.deepStrictEqual(ran('tabm +2'), { command: 'moveTabRight', options: {}, count: 2 });
  assert.deepStrictEqual(ran('tabm -1'), { command: 'moveTabLeft', options: {}, count: 1 });
});

test('lines that can\'t run say why', () => {
  assert.strictEqual(resolve(''), null);
  assert.strictEqual(resolve(' : '), null);
  assert.deepStrictEqual(ran('xyzzy'), { error: 'Not a command: xyzzy' });
  assert.deepStrictEqual(ran('q now'), { error: ':q takes nothing after it' });
  assert.deepStrictEqual(ran('tabm 3'), { error: ':tabmove takes +N or -N, the tabs to move by' });
  // Only Vimov's own words: nothing from Object.prototype.
  assert.deepStrictEqual(ran('constructor'), { error: 'Not a command: constructor' });
});

test('Tab offers commands, then the long Vim words', () => {
  assert.deepStrictEqual(plain(complete('scrollToT')), ['scrollToTop']);
  assert.deepStrictEqual(plain(complete('scrollt')), ['scrollToTop', 'scrollToBottom', 'scrollToLeft', 'scrollToRight']);
  assert.deepStrictEqual(plain(complete('tabn')), ['tabnext', 'tabnew']);
  assert.deepStrictEqual(plain(complete('re')), ['reload', 'readerView', 'restoreTab']);
  assert.deepStrictEqual(plain(complete('')), []);
});
