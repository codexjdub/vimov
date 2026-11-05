'use strict';

// src/content/help.js: the help overlay's keys.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run } = require('./helpers');

// A stand-in element that accepts any call made on it.
const node = () => new Proxy(function () {}, {
  get: (_, name) => (name === 'clientHeight' ? 400 : name === 'then' ? undefined : node()),
  apply: () => node(),
});

test('the help overlay takes its keys and lets browser shortcuts through', () => {
  const ctx = load(SHARED, { browser: {} });
  ctx.Vimov.ui = { el: node, root: node, setStatus() {}, message() {} };
  run(ctx, ['src/content/core.js', 'src/content/help.js']);
  ctx.Vimov.state.keymap = ctx.Vimov.keys.buildKeymap('');
  ctx.Vimov.help.open();
  const help = ctx.Vimov.mode.current;
  assert.strictEqual(help.name, 'help');
  assert.strictEqual(help.onKey('<c-l>', { ctrlKey: true }), false);
  assert.strictEqual(help.onKey('<m-l>', { metaKey: true }), false);
  assert.strictEqual(help.onKey('j', {}), true);
  assert.strictEqual(help.onKey('x', {}), true);
  assert.strictEqual(ctx.Vimov.mode.current, help);
  help.onKey('<esc>', {});
  assert.strictEqual(ctx.Vimov.mode.current, null);
});
