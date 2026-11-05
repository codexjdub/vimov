'use strict';

// src/options/options.js: saving, with stand-in fields and storage.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run, event } = require('./helpers');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(initial) {
  const elements = {};
  const element = (id) => (elements[id] ||= {
    id, value: '', checked: false, disabled: false, textContent: '', listeners: {},
    type: id === 'smoothScroll' ? 'checkbox' : 'text',
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    replaceChildren() {}, append() {},
  });
  const stored = { ...initial };
  const writes = [];
  const onChanged = event();
  const ctx = load(SHARED, {
    document: { getElementById: element, createElement: () => element(Symbol('new')), querySelector: () => element('tbody') },
    addEventListener() {},
    browser: {
      storage: {
        sync: {
          get: async (defaults) => ({ ...defaults, ...stored }),
          set: async (values) => {
            writes.push(Object.keys(values));
            Object.assign(stored, values);
            await onChanged.fire(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { newValue: v }])), 'sync');
          },
        },
        onChanged,
      },
    },
  });
  run(ctx, ['src/options/options.js']);
  await tick();
  const type = (id, value) => {
    element(id).value = value;
    element(id).listeners.input.forEach((fn) => fn());
  };
  // Another part of Vimov (the toolbar button) changing a setting.
  const elsewhere = (values) => {
    Object.assign(stored, values);
    return onChanged.fire(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { newValue: v }])), 'sync');
  };
  const save = async () => {
    element('save').listeners.click.forEach((fn) => fn());
    await tick();
  };
  return { element, stored, writes, type, elsewhere, save };
}

test('saving with unsaved edits keeps a change the toolbar button made', async () => {
  const { element, stored, writes, type, elsewhere, save } = await setup({ exclusions: 'news.example.com' });
  type('keymap', 'map Q closeTab');
  await elsewhere({ exclusions: 'news.example.com\nmail.example.com' });
  // The field nobody edited here shows the change at once.
  assert.strictEqual(element('exclusions').value, 'news.example.com\nmail.example.com');
  await save();
  assert.deepStrictEqual(writes, [['keymap']]);
  assert.strictEqual(stored.exclusions, 'news.example.com\nmail.example.com');
  assert.strictEqual(stored.keymap, 'map Q closeTab');
  assert.strictEqual(element('save').disabled, true);
});

test('an edit made here wins over a change made elsewhere to the same setting', async () => {
  const { element, stored, type, elsewhere, save } = await setup({ exclusions: 'a.example' });
  type('exclusions', 'b.example');
  await elsewhere({ exclusions: 'a.example\nc.example' });
  assert.strictEqual(element('exclusions').value, 'b.example');
  assert.strictEqual(element('save').disabled, false);
  await save();
  assert.strictEqual(stored.exclusions, 'b.example');
});
