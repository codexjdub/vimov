'use strict';

// src/content/search.js: what the vbar says when it has nothing to list.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run } = require('./helpers');

const ctx = load(SHARED, { browser: {} });
ctx.Vimov.ui = { el() {}, root() {}, message() {} };
run(ctx, ['src/content/search.js']);
const { emptyText } = ctx.Vimov.search;

test('an empty vbar says what found nothing, in the source the query searches', () => {
  assert.strictEqual(emptyText('zzz', 'tabs'), 'No open tabs match “zzz”');
  assert.strictEqual(emptyText('zzz', 'bookmarks'), 'No bookmarks match “zzz”');
  // A symbol word picks the source, as in the address bar; the last one wins.
  assert.strictEqual(emptyText('% zzz', 'all'), 'No open tabs match “zzz”');
  assert.strictEqual(emptyText('zzz * qq ^', 'all'), 'Nothing in your history matches “zzz qq”');
  // "constructor" is a word, not a symbol.
  assert.strictEqual(emptyText('constructor', 'tabs'), 'No open tabs match “constructor”');
  assert.strictEqual(emptyText('zzz', 'all'), 'Nothing matches “zzz”');
});

test('with nothing typed, an empty vbar says there\'s nothing yet', () => {
  assert.strictEqual(emptyText('', 'tabs'), 'No other open tabs');
  assert.strictEqual(emptyText('  ', 'bookmarks'), 'No bookmarks yet');
  assert.strictEqual(emptyText('^', 'all'), 'No history yet');
  assert.strictEqual(emptyText('?', 'all'), 'Type what to search the web for');
  assert.strictEqual(emptyText('', 'all'), 'No other open tabs yet. Type to search bookmarks, history and the web');
});
