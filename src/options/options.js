'use strict';

const $ = (id) => document.getElementById(id);

$('version').textContent = browser.runtime.getManifest().version;

// The tab layout's radio buttons, as one field.
const layoutRadios = [...document.querySelectorAll('input[name="tabLayout"]')];
const layoutField = {
  type: 'radio',
  get value() {
    return layoutRadios.find((radio) => radio.checked)?.value || Vimov.DEFAULT_SETTINGS.tabLayout;
  },
  set value(layout) {
    for (const radio of layoutRadios) radio.checked = radio.value === layout;
  },
  addEventListener: (type, fn) => layoutRadios.forEach((radio) => radio.addEventListener(type, fn)),
};

const fields = {
  keymap: $('keymap'),
  exclusions: $('exclusions'),
  hintChars: $('hintChars'),
  scrollStep: $('scrollStep'),
  smoothScroll: $('smoothScroll'),
  tabLayout: layoutField,
};
// The stored settings as the fields show them, to tell which have been
// edited. null for one that changed elsewhere while edited here.
let stored = {};

function read() {
  return {
    keymap: fields.keymap.value,
    exclusions: fields.exclusions.value,
    hintChars: fields.hintChars.value.trim(),
    scrollStep: Number(fields.scrollStep.value),
    smoothScroll: fields.smoothScroll.checked,
    tabLayout: fields.tabLayout.value,
  };
}

// Shows settings in their fields; settings not given are left alone.
function fill(settings) {
  for (const [name, value] of Object.entries(settings)) {
    if (!Object.hasOwn(fields, name)) continue;
    if (fields[name].type === 'checkbox') fields[name].checked = value;
    else fields[name].value = value;
  }
}

// The names of the settings edited here and not saved.
const edited = (settings) => Object.keys(fields).filter((name) => settings[name] !== stored[name]);

function lineProblems(errors) {
  return errors.map(({ line, message }) => ({ level: 'error', text: `Line ${line}: ${message}` }));
}

// Shows problems under each field. Returns false if any would block saving.
function validate(settings) {
  const keymap = Vimov.keys.buildKeymap(settings.keymap);
  const problems = {
    keymap: [
      ...lineProblems(keymap.errors),
      ...keymap.warnings.map((text) => ({ level: 'warning', text })),
    ],
    exclusions: lineProblems(Vimov.keys.parseExclusions(settings.exclusions).errors),
    hintChars: Vimov.normalizeHintChars(settings.hintChars)
      ? []
      : [{ level: 'error', text: 'Use at least two different characters.' }],
    scrollStep: Number.isFinite(settings.scrollStep) && settings.scrollStep >= 1
      ? []
      : [{ level: 'error', text: 'Enter a step of at least 1 pixel.' }],
  };
  for (const [name, list] of Object.entries(problems)) {
    $(`${name}-problems`).replaceChildren(
      ...list.map(({ level, text }) => Object.assign(document.createElement('li'), { className: level, textContent: text })),
    );
  }
  return Object.values(problems).flat().every((p) => p.level !== 'error');
}

function refresh() {
  const settings = read();
  const valid = validate(settings);
  const dirty = edited(settings).length > 0;
  $('save').disabled = !valid || !dirty;
  $('status').textContent = !valid ? 'Fix the errors to save.' : dirty ? 'Unsaved changes' : '';
}

// Saves only the settings edited here, so one changed elsewhere in the
// meantime (by the toolbar button, say) isn't put back.
async function save() {
  const settings = read();
  const names = edited(settings);
  if (!validate(settings) || !names.length) return;
  settings.hintChars = Vimov.normalizeHintChars(settings.hintChars);
  const changes = Object.fromEntries(names.map((name) => [name, settings[name]]));
  try {
    await browser.storage.sync.set(changes);
  } catch (err) {
    $('status').textContent = `Couldn’t save: ${err.message}`;
    return;
  }
  fill(changes);
  const now = read();
  for (const name of names) stored[name] = now[name];
  refresh();
  $('status').textContent = 'Saved';
  // Another layout no longer needs to read Firefox's settings.
  if (changes.tabLayout && changes.tabLayout !== 'firefox') browser.permissions.remove(BROWSER_SETTINGS).catch(() => {});
}

// "Follow Firefox's setting" for tabs reads whether Firefox shows them down
// the side, with this optional permission (src/background.js).
const BROWSER_SETTINGS = { permissions: ['browserSettings'] };
let layoutBefore = Vimov.DEFAULT_SETTINGS.tabLayout; // to go back to if the permission is refused
let layoutRequest = 0;

// Says what the chosen tab layout means now, and lists the keys to match.
async function showLayout() {
  const id = ++layoutRequest;
  const layout = fields.tabLayout.value;
  let firefoxVertical = false;
  let note = '';
  if (layout === 'firefox') {
    const allowed = await browser.permissions.contains(BROWSER_SETTINGS).catch(() => false);
    const setting = allowed && browser.browserSettings?.verticalTabs;
    if (!allowed) {
      note = 'Vimov doesn’t have permission to read Firefox’s setting, so it treats your tabs as across the top. Choose this option again to allow it.';
    } else if (!setting) {
      note = 'This version of Firefox doesn’t tell extensions how it shows tabs (Firefox 142 and later do), so Vimov treats them as across the top.';
    } else {
      firefoxVertical = (await setting.get({}).catch(() => ({})))?.value === true;
      note = firefoxVertical
        ? 'Firefox shows your tabs down the side, so J goes to the next tab. Vimov follows when you change it.'
        : 'Firefox shows your tabs across the top, so K goes to the next tab. Vimov follows when you change it.';
    }
  }
  if (id !== layoutRequest) return;
  $('tabLayout-note').textContent = note;
  buildReference({ verticalTabs: Vimov.verticalTabs({ tabLayout: layout }, firefoxVertical) });
}

// Firefox asks for a permission only from a click, so choosing "Follow
// Firefox's setting" asks right then. If it's refused, the choice goes back.
for (const radio of layoutRadios) {
  radio.addEventListener('click', () => {
    if (radio.value !== 'firefox') {
      layoutBefore = radio.value;
      return;
    }
    browser.permissions.request(BROWSER_SETTINGS).catch(() => false).then((granted) => {
      if (!granted) fields.tabLayout.value = layoutBefore;
      refresh();
      showLayout();
    });
  });
}

const TYPE_SYNTAX = { boolean: 'true|false', number: '<number>', string: '<text>' };

function optionSyntax(options = {}) {
  return Object.entries(options)
    .map(([name, type]) => `${name}=${Array.isArray(type) ? type.join('|') : TYPE_SYNTAX[type]}`)
    .join(' ');
}

// `layout` is { verticalTabs }, as for buildKeymap().
function buildReference(layout = {}) {
  const defaults = new Map();
  for (const { keys, command, options } of Vimov.keys.buildKeymap('', layout).bindings.values()) {
    const suffix = Object.entries(options).map(([name, value]) => ` ${name}=${value}`).join('');
    if (!defaults.has(command)) defaults.set(command, []);
    defaults.get(command).push(keys.join('') + suffix);
  }
  const rows = Object.entries(Vimov.COMMANDS).map(([name, spec]) => {
    const row = document.createElement('tr');
    const cells = [name, Vimov.describeCommand(name, {}, layout), optionSyntax(spec.options), (defaults.get(name) || []).join(', ')];
    cells.forEach((text, i) => {
      const cell = document.createElement('td');
      if (text && i !== 1) cell.append(Object.assign(document.createElement('code'), { textContent: text }));
      else cell.textContent = text;
      row.append(cell);
    });
    return row;
  });
  document.querySelector('#commands tbody').replaceChildren(...rows);
  $('default-keymap').textContent = layout.verticalTabs
    ? `${Vimov.DEFAULT_KEYMAP}\n# With tabs down the side\n${Vimov.VERTICAL_TABS_KEYMAP}`
    : Vimov.DEFAULT_KEYMAP;
}

for (const field of Object.values(fields)) field.addEventListener('input', refresh);
layoutField.addEventListener('input', showLayout);
$('save').addEventListener('click', save);
$('reset').addEventListener('click', () => {
  fill(Vimov.DEFAULT_SETTINGS);
  refresh();
  showLayout();
});
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
});
addEventListener('beforeunload', (e) => {
  if (edited(read()).length) e.preventDefault();
});

function load() {
  return browser.storage.sync.get(Vimov.DEFAULT_SETTINGS).then((settings) => {
    fill(settings);
    stored = read();
    if (settings.tabLayout !== 'firefox') layoutBefore = settings.tabLayout;
    refresh();
    showLayout();
  });
}

buildReference();
load();
// Settings changed elsewhere, by the toolbar button or another options tab:
// shown in the fields not edited here. An edited field keeps the edit, and
// saving writes it.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.firefoxVerticalTabs) showLayout();
  if (area !== 'sync') return;
  const current = read();
  const names = Object.keys(changes).filter((name) => Object.hasOwn(fields, name));
  const untouched = names.filter((name) => current[name] === stored[name]);
  fill(Object.fromEntries(untouched.map((name) => [name, changes[name].newValue ?? Vimov.DEFAULT_SETTINGS[name]])));
  const now = read();
  for (const name of names) stored[name] = untouched.includes(name) ? now[name] : null;
  refresh();
  if (untouched.includes('tabLayout')) showLayout();
});
