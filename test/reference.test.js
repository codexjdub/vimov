'use strict';

// src/shared/reference.js: the key list the help overlay and the welcome
// page show.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, plain } = require('./helpers');

const { Vimov } = load([...SHARED, 'src/shared/reference.js']);
const reference = (keymap = '') => plain(Vimov.keyReference.build(Vimov.keys.buildKeymap(keymap).bindings));
const row = (sections, description) => sections.flatMap((s) => s.rows).find((r) => r.description === description);

test('opposite commands share a row, keys of each on either side of the slash', () => {
  const sections = reference();
  assert.deepStrictEqual(sections[0].rows[0], { groups: [['j'], ['k']], description: 'Scroll down / up' });
  assert.deepStrictEqual(row(sections, 'Go one tab right / left').groups, [['K', 'gt'], ['J', 'gT']]);
  assert.deepStrictEqual(row(sections, 'Go to the next / previous match').groups, [['n'], ['N']]);
  // The same command here and in a new tab.
  assert.deepStrictEqual(row(sections, 'Search bookmarks, here / in a new tab').groups, [['b'], ['B']]);
  assert.deepStrictEqual(row(sections, 'Open the URL on the clipboard, or search for its text, here / in a new tab').groups, [['p'], ['P']]);
  // Different options stay apart.
  assert(row(sections, 'Reload the page') && row(sections, 'Reload, bypassing the cache'));
  assert(row(sections, 'Search open tabs'));
});

test('the list is about a third shorter than one row per command', () => {
  const rows = reference().filter((s) => !s.category.startsWith('In ')).flatMap((s) => s.rows);
  assert.strictEqual(rows.length, 33);
});

test('a pair is split when one side is unmapped or remapped', () => {
  const sections = reference('unmap k\nmap <c-y> scrollUp');
  assert.deepStrictEqual(row(sections, 'Scroll down / up').groups, [['j'], ['<c-y>']]);
  const alone = reference('unmap k');
  assert.deepStrictEqual(row(alone, 'Scroll down').groups, [['j']]);
  assert.strictEqual(row(alone, 'Scroll down / up'), undefined);
});

test('keys inside the vbar, find and hints come last', () => {
  const categories = reference().map((s) => s.category);
  assert.deepStrictEqual(categories.slice(-3), ['In the vbar', 'In find', 'In link hints']);
  assert.deepStrictEqual(row(reference(), 'Next / previous match while typing').groups, [['<c-j>'], ['<c-k>']]);
});

test('keys are shown as people write them', () => {
  const text = Vimov.keyReference.text;
  assert.deepStrictEqual(
    ['gg', '<a-p>', '<c-j>', '<s-enter>', '<c-D>', '<c-->', 'g<c-d>', '<<', '?', '<esc>', '<f5>'].map(text),
    ['gg', 'Alt+P', 'Ctrl+J', 'Shift+Enter', 'Ctrl+Shift+D', 'Ctrl+-', 'g Ctrl+D', '<<', '?', 'Esc', 'F5'],
  );
});

test('with tabs down the side, J and K swap and the words say down and up', () => {
  const layout = { verticalTabs: true };
  const sections = plain(Vimov.keyReference.build(Vimov.keys.buildKeymap('', layout).bindings, layout));
  assert.deepStrictEqual(row(sections, 'Go one tab down / up').groups, [['J', 'gt'], ['K', 'gT']]);
  assert(row(sections, 'Move the tab up / down'));
  assert.strictEqual(Vimov.describeCommand('nextTab', {}, layout), 'Go one tab down');
  assert.strictEqual(Vimov.describeCommand('nextTab'), 'Go one tab right');
});

test('filtering keeps the rows with every word in their category, words or keys', () => {
  const { filter } = Vimov.keyReference;
  const sections = reference();
  const descriptions = (query) => filter(sections, query).flatMap((s) => s.rows.map((r) => r.description));
  // By what the row says, in any case.
  assert(descriptions('RELOAD').includes('Reload the page'));
  assert(descriptions('reload cache').every((d) => d === 'Reload, bypassing the cache'));
  // By keys, as written or as shown.
  assert(descriptions('gt').includes('Go one tab right / left'));
  assert(descriptions('ctrl+j').includes('Next / previous result (Tab and the arrow keys too)'));
  // By category: "tabs" finds the Tabs section's rows.
  assert(descriptions('tabs').includes('Duplicate the tab'));
  // Sections left empty are dropped; nothing typed keeps everything.
  assert.deepStrictEqual(filter(sections, 'zzz'), []);
  assert.strictEqual(filter(sections, '  '), sections);
});
