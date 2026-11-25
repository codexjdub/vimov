'use strict';

// src/options/options.js: saving, with stand-in fields and storage.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run, event } = require('./helpers');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(initial, { vertical = false } = {}) {
  const elements = {};
  // The tab layout's radio buttons.
  const radios = ['top', 'side', 'firefox'].map((value) => ({
    value, checked: false, listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  }));
  // The optional browserSettings permission: whether it's granted, and what
  // the user answers when asked.
  const permission = { granted: false, answer: true, asked: 0, removed: 0 };
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
    document: {
      getElementById: element,
      createElement: () => element(Symbol('new')),
      querySelector: () => element('tbody'),
      querySelectorAll: () => radios,
    },
    addEventListener() {},
    browser: {
      permissions: {
        contains: async () => permission.granted,
        request: async () => {
          permission.asked++;
          return (permission.granted = permission.answer);
        },
        remove: async () => {
          permission.removed++;
          permission.granted = false;
        },
      },
      // Only there once the permission is granted, as in Firefox.
      get browserSettings() {
        return permission.granted ? { verticalTabs: { get: async () => ({ value: vertical }) } } : undefined;
      },
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
  // Clicking a tab layout, as Firefox does it: checked, then click, then input.
  const choose = async (value) => {
    for (const radio of radios) radio.checked = radio.value === value;
    const radio = radios.find((r) => r.value === value);
    for (const type of ['click', 'input']) (radio.listeners[type] || []).forEach((fn) => fn());
    for (let i = 0; i < 5; i++) await tick();
  };
  const layout = () => radios.find((r) => r.checked)?.value;
  return { element, stored, writes, type, elsewhere, save, choose, layout, permission };
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

test('following Firefox asks for the permission; refused, the choice goes back', async () => {
  const { element, choose, layout, permission } = await setup({ tabLayout: 'side' });
  assert.strictEqual(layout(), 'side');
  permission.answer = false;
  await choose('firefox');
  assert.strictEqual(permission.asked, 1);
  assert.strictEqual(layout(), 'side');
  assert.strictEqual(element('save').disabled, true);
});

test('following Firefox, the note says what Firefox shows; another layout gives the permission back', async () => {
  const { element, stored, save, choose, permission } = await setup({}, { vertical: true });
  await choose('firefox');
  assert.match(element('tabLayout-note').textContent, /down the side, so J goes to the next tab/);
  await save();
  assert.strictEqual(stored.tabLayout, 'firefox');
  assert.strictEqual(permission.granted, true);
  await choose('side');
  assert.strictEqual(element('tabLayout-note').textContent, '');
  await save();
  assert.strictEqual(stored.tabLayout, 'side');
  assert.deepStrictEqual([permission.removed, permission.granted], [1, false]);
});

test('following Firefox without the permission (synced from elsewhere) says how to allow it', async () => {
  const { element } = await setup({ tabLayout: 'firefox' });
  await tick();
  assert.match(element('tabLayout-note').textContent, /Choose this option again to allow it/);
});
