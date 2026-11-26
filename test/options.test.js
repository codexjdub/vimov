'use strict';

// src/options/options.js: saving, with stand-in fields and storage.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, run, event } = require('./helpers');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// `vertical`: what Firefox shows. `tells`: whether this Firefox says
// (142 and later do).
async function setup(initial, { vertical = false, tells = true, zen = false } = {}) {
  const elements = {};
  // The tab layout's radio buttons.
  const radios = ['top', 'side', 'firefox'].map((value) => ({
    value, checked: false, listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  }));
  const element = (id) => (elements[id] ||= {
    id, value: '', checked: false, disabled: false, textContent: '', listeners: {},
    type: id === 'smoothScroll' ? 'checkbox' : 'text',
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    replaceChildren() {}, append() {},
  });
  const stored = { ...initial };
  const local = {};
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
      runtime: {
        getManifest: () => ({ version: '0.6.0' }),
        getBrowserInfo: async () => (zen ? { name: 'Firefox', zen: { version: '1.19b' } } : { name: 'Firefox' }),
      },
      browserSettings: tells ? { verticalTabs: { get: async () => ({ value: vertical }) } } : {},
      storage: {
        local: { get: async (defaults) => ({ ...defaults, ...local }) },
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
  run(ctx, ['src/shared/stats.js', 'src/options/options.js']);
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
  return { element, stored, writes, type, elsewhere, save, choose, layout };
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

test('by default the tabs follow Firefox, and the note says what Firefox shows', async () => {
  const { element, layout } = await setup({}, { vertical: true });
  await tick();
  assert.strictEqual(layout(), 'firefox');
  assert.match(element('tabLayout-note').textContent, /down the side, so J goes to the next tab/);
  // The default isn't an edit.
  assert.strictEqual(element('save').disabled, true);
});

test('choosing another layout saves it, and following Firefox again says what it shows', async () => {
  const { element, stored, save, choose } = await setup({});
  await choose('side');
  assert.strictEqual(element('tabLayout-note').textContent, '');
  await save();
  assert.strictEqual(stored.tabLayout, 'side');
  await choose('firefox');
  assert.match(element('tabLayout-note').textContent, /across the top, so K goes to the next tab/);
  await save();
  assert.strictEqual(stored.tabLayout, 'firefox');
});

test('in Zen the note says the tabs are down the side; across the top, it mentions sidebar extensions', async () => {
  const zen = await setup({}, { zen: true });
  await tick();
  assert.strictEqual(zen.element('tabLayout-note').textContent, 'Zen shows your tabs down the side, so J goes to the next tab.');
  const firefox = await setup({});
  await tick();
  assert.match(firefox.element('tabLayout-note').textContent, /Sidebery or Tree Style Tab\? Choose Down the side\.$/);
});

test('on a Firefox that can\'t tell, the note says the tabs count as across the top', async () => {
  const { element } = await setup({}, { tells: false });
  await tick();
  assert.match(element('tabLayout-note').textContent, /Firefox 142 and later do/);
});
