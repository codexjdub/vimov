'use strict';

const $ = (id) => document.getElementById(id);
const fields = {
  keymap: $('keymap'),
  exclusions: $('exclusions'),
  hintChars: $('hintChars'),
  scrollStep: $('scrollStep'),
  smoothScroll: $('smoothScroll'),
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
}

const TYPE_SYNTAX = { boolean: 'true|false', number: '<number>', string: '<text>' };

function optionSyntax(options = {}) {
  return Object.entries(options)
    .map(([name, type]) => `${name}=${Array.isArray(type) ? type.join('|') : TYPE_SYNTAX[type]}`)
    .join(' ');
}

function buildReference() {
  const defaults = new Map();
  for (const { keys, command, options } of Vimov.keys.buildKeymap('').bindings.values()) {
    const suffix = Object.entries(options).map(([name, value]) => ` ${name}=${value}`).join('');
    if (!defaults.has(command)) defaults.set(command, []);
    defaults.get(command).push(keys.join('') + suffix);
  }
  const rows = Object.entries(Vimov.COMMANDS).map(([name, spec]) => {
    const row = document.createElement('tr');
    const cells = [name, Vimov.describeCommand(name), optionSyntax(spec.options), (defaults.get(name) || []).join(', ')];
    cells.forEach((text, i) => {
      const cell = document.createElement('td');
      if (text && i !== 1) cell.append(Object.assign(document.createElement('code'), { textContent: text }));
      else cell.textContent = text;
      row.append(cell);
    });
    return row;
  });
  document.querySelector('#commands tbody').replaceChildren(...rows);
  $('default-keymap').textContent = Vimov.DEFAULT_KEYMAP;
}

for (const field of Object.values(fields)) field.addEventListener('input', refresh);
$('save').addEventListener('click', save);
$('reset').addEventListener('click', () => {
  fill(Vimov.DEFAULT_SETTINGS);
  refresh();
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
    refresh();
  });
}

buildReference();
load();
// Settings changed elsewhere, by the toolbar button or another options tab:
// shown in the fields not edited here. An edited field keeps the edit, and
// saving writes it.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const current = read();
  const names = Object.keys(changes).filter((name) => Object.hasOwn(fields, name));
  const untouched = names.filter((name) => current[name] === stored[name]);
  fill(Object.fromEntries(untouched.map((name) => [name, changes[name].newValue ?? Vimov.DEFAULT_SETTINGS[name]])));
  const now = read();
  for (const name of names) stored[name] = untouched.includes(name) ? now[name] : null;
  refresh();
});
