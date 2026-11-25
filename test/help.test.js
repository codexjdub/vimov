'use strict';

// src/content/help.js: the help overlay's keys and its filter.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run } = require('./helpers');

// A stand-in element: enough of the DOM for the overlay, with focus and
// blur firing their listeners as the browser's do.
function fakeElement(tag, className = '', text = '') {
  const node = {
    tag, className, textContent: text, value: '', children: [], listeners: {}, attributes: {},
    clientHeight: 400, scrollTop: 0,
    append: (...kids) => node.children.push(...kids),
    replaceChildren: (...kids) => (node.children = kids),
    remove() {},
    setAttribute: (name, value) => (node.attributes[name] = value),
    addEventListener: (type, fn) => (node.listeners[type] ||= []).push(fn),
    fire: (type, event = { stopPropagation() {} }) => (node.listeners[type] || []).forEach((fn) => fn(event)),
    focus: () => node.fire('focus'),
    blur: () => node.fire('blur'),
    scrollBy() {},
  };
  return node;
}

function setup() {
  const made = [];
  const ctx = load(SHARED, { browser: {}, document: { activeElement: null } });
  const el = (...args) => {
    const node = fakeElement(...args);
    made.push(node);
    return node;
  };
  ctx.Vimov.ui = { el, root: () => fakeElement('root'), setStatus() {}, message() {} };
  run(ctx, ['src/shared/reference.js', 'src/content/core.js', 'src/content/help.js']);
  ctx.Vimov.state.keymap = ctx.Vimov.keys.buildKeymap('');
  ctx.Vimov.help.open();
  const help = ctx.Vimov.mode.current;
  const box = made.find((n) => n.className === 'filter');
  const columns = made.find((n) => n.className === 'columns');
  const headings = () => columns.children.map((section) => section.children[0]?.textContent || section.textContent);
  const type = (text) => {
    box.value = text;
    box.fire('input');
  };
  return { ctx, help, box, headings, type };
}

test('the help overlay takes its keys and lets browser shortcuts through', () => {
  const { ctx, help } = setup();
  assert.strictEqual(help.name, 'help');
  assert.strictEqual(help.onKey('<c-l>', { ctrlKey: true }), false);
  assert.strictEqual(help.onKey('<m-l>', { metaKey: true }), false);
  assert.strictEqual(help.onKey('j', {}), true);
  assert.strictEqual(help.onKey('x', {}), true);
  assert.strictEqual(ctx.Vimov.mode.current, help);
  help.onKey('<esc>', {});
  assert.strictEqual(ctx.Vimov.mode.current, null);
});

test('/ filters the rows; Enter keeps the filter, Esc drops it, a second Esc closes', () => {
  const { ctx, help, headings, type } = setup();
  assert.strictEqual(help.onKey('/', {}), true);
  // Typing goes into the box, not to the help's own keys.
  assert.strictEqual(help.onKey('t', {}), false);
  type('tab');
  assert(headings().includes('Tabs') && !headings().includes('Scrolling'));
  assert.strictEqual(help.onKey('<enter>', {}), true);
  // Back to scrolling, with the filter kept.
  assert.strictEqual(help.onKey('j', {}), true);
  assert(!headings().includes('Scrolling'));
  help.onKey('<esc>', {});
  assert(headings().includes('Scrolling'));
  assert.strictEqual(ctx.Vimov.mode.current, help);
  help.onKey('<esc>', {});
  assert.strictEqual(ctx.Vimov.mode.current, null);
});

test('a filter that matches nothing says so, and Esc while typing clears it', () => {
  const { help, headings, type } = setup();
  help.onKey('/', {});
  type('zzz');
  assert.deepStrictEqual(headings(), ['No keys match “zzz”']);
  help.onKey('<esc>', {});
  assert(headings().includes('Scrolling'));
});
