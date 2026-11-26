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
}

// "Follow Firefox's setting" for tabs reads whether Firefox shows them down
// the side (src/background.js).
let layoutRequest = 0;

// Says what the chosen tab layout means now, and lists the keys to match.
async function showLayout() {
  const id = ++layoutRequest;
  const layout = fields.tabLayout.value;
  let firefoxVertical = false;
  let note = '';
  if (layout === 'firefox') {
    const setting = browser.browserSettings?.verticalTabs;
    if (await Vimov.isZen()) {
      firefoxVertical = true;
      note = 'Zen shows your tabs down the side, so J goes to the next tab.';
    } else if (!setting) {
      note = 'This version of Firefox doesn’t tell extensions how it shows tabs (Firefox 142 and later do), so Vimov treats them as across the top.';
    } else {
      firefoxVertical = (await setting.get({}).catch(() => ({})))?.value === true;
      note = firefoxVertical
        ? 'Firefox shows your tabs down the side, so J goes to the next tab. Vimov follows when you change it.'
        : 'Firefox shows your tabs across the top, so K goes to the next tab. Vimov follows when you change it. ' +
          'Using a sidebar for your tabs, such as Sidebery or Tree Style Tab? Choose Down the side.';
    }
  }
  if (id !== layoutRequest) return;
  $('tabLayout-note').textContent = note;
  buildReference({ verticalTabs: Vimov.verticalTabs({ tabLayout: layout }, firefoxVertical) });
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

// Your week with Vimov (src/shared/stats.js). The numbers count up to what
// they are, and on as the counts come in while the page is open.
const WEEK_KINDS = ['links', 'px', 'tabs'];
const weekText = {
  links: (n) => Math.round(n).toLocaleString('en'),
  px: (n) => Vimov.formatDistance(Vimov.pxToMeters(n)),
  tabs: (n) => Math.round(n).toLocaleString('en'),
};
let weekShown = null; // the numbers in the tiles
let weekFrame = 0;

const plural = (n, one, many) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

function drawWeek(values) {
  for (const kind of WEEK_KINDS) $(`week-${kind}`).textContent = weekText[kind](values[kind]);
}

async function showWeek() {
  let stats = null;
  try {
    ({ stats } = await browser.storage.local.get({ stats: null }));
  } catch {}
  const week = Vimov.statsFor(stats, new Date());
  const [y, m, d] = week.week.split('-').map(Number);
  const monday = new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
  $('week-since').textContent = `Since ${monday}`;
  $('week-like').textContent = Vimov.distanceLike(Vimov.pxToMeters(week.px));
  const empty = WEEK_KINDS.every((kind) => !week[kind]);
  const notes = [
    empty
      ? 'Nothing yet this week: follow a link with f, scroll with j, and switch tabs with J and K.'
      : 'Counted on this computer only; nothing is sent anywhere.',
  ];
  if (week.last) {
    const { links, px, tabs } = week.last;
    const distance = Vimov.formatDistance(Vimov.pxToMeters(px));
    notes.push(`Last week: ${plural(links, 'link', 'links')}, ${distance} scrolled, ${plural(tabs, 'tab switch', 'tab switches')}.`);
  }
  $('week-note').textContent = notes.join(' ');

  const from = weekShown || { links: 0, px: 0, tabs: 0 };
  weekShown = week;
  const still =
    typeof requestAnimationFrame !== 'function' || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (still) return drawWeek(week);
  cancelAnimationFrame(weekFrame);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 700, 1);
    const eased = 1 - (1 - t) ** 3;
    drawWeek(Object.fromEntries(WEEK_KINDS.map((kind) => [kind, from[kind] + (week[kind] - from[kind]) * eased])));
    if (t < 1) weekFrame = requestAnimationFrame(step);
  };
  weekFrame = requestAnimationFrame(step);
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
    refresh();
    showLayout();
  });
}

buildReference();
load();
showWeek();
// Settings changed elsewhere, by the toolbar button or another options tab:
// shown in the fields not edited here. An edited field keeps the edit, and
// saving writes it.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.firefoxVerticalTabs) showLayout();
  if (area === 'local' && changes.stats) showWeek();
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
