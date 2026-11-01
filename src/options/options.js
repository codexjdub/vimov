'use strict';

const $ = (id) => document.getElementById(id);
const fields = {
  keymap: $('keymap'),
  exclusions: $('exclusions'),
  hintChars: $('hintChars'),
  scrollStep: $('scrollStep'),
  smoothScroll: $('smoothScroll'),
};
let saved = ''; // the stored settings as JSON, to detect unsaved changes

function read() {
  return {
    keymap: fields.keymap.value,
    exclusions: fields.exclusions.value,
    hintChars: fields.hintChars.value.trim(),
    scrollStep: Number(fields.scrollStep.value),
    smoothScroll: fields.smoothScroll.checked,
  };
}

function fill(settings) {
  fields.keymap.value = settings.keymap;
  fields.exclusions.value = settings.exclusions;
  fields.hintChars.value = settings.hintChars;
  fields.scrollStep.value = settings.scrollStep;
  fields.smoothScroll.checked = settings.smoothScroll;
}

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
  const dirty = JSON.stringify(settings) !== saved;
  $('save').disabled = !valid || !dirty;
  $('status').textContent = !valid ? 'Fix the errors to save.' : dirty ? 'Unsaved changes' : '';
}

async function save() {
  const settings = read();
  if (!validate(settings) || JSON.stringify(settings) === saved) return;
  settings.hintChars = Vimov.normalizeHintChars(settings.hintChars);
  try {
    await browser.storage.sync.set(settings);
  } catch (err) {
    $('status').textContent = `Couldn’t save: ${err.message}`;
    return;
  }
  fill(settings);
  saved = JSON.stringify(read());
  refresh();
  $('status').textContent = 'Saved';
}

function optionSyntax(options = {}) {
  return Object.entries(options)
    .map(([name, type]) => `${name}=${Array.isArray(type) ? type.join('|') : type === 'boolean' ? 'true|false' : '<number>'}`)
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
  if (JSON.stringify(read()) !== saved) e.preventDefault();
});

buildReference();
browser.storage.sync.get(Vimov.DEFAULT_SETTINGS).then((settings) => {
  fill(settings);
  saved = JSON.stringify(read());
  refresh();
});
