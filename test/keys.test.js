'use strict';

// src/shared/keys.js and commands.js: keymap and exclusion parsing, command
// descriptions.

const test = require('node:test');
const assert = require('node:assert');
const { SHARED, load, plain } = require('./helpers');

const { Vimov } = load(SHARED);

const build = (text) => {
  const keymap = Vimov.keys.buildKeymap(text);
  return { ...keymap, errors: plain(keymap.errors), warnings: plain(keymap.warnings) };
};

test('the default keymap builds cleanly', () => {
  const keymap = build('');
  assert.deepStrictEqual([keymap.errors, keymap.warnings], [[], []]);
  assert.deepStrictEqual(plain(keymap.bindings.get('B').options), { in: 'bookmarks', newTab: true });
  assert.strictEqual(keymap.bindings.get('o').command, 'search');
  assert.strictEqual(keymap.bindings.get('}').command, 'nextPage');
  assert.strictEqual(keymap.bindings.get('{').command, 'previousPage');
  // [ and ] are left to video speed extensions.
  assert(![...keymap.bindings.keys(), ...keymap.prefixes].some((id) => /[[\]]/.test(id)));
  assert.deepStrictEqual(plain(keymap.bindings.get('P').options), { newTab: true });
});

test('key notation', () => {
  assert.deepStrictEqual(plain(Vimov.keys.parse('g<c-d>x')), ['g', '<c-d>', 'x']);
  assert.deepStrictEqual(plain(Vimov.keys.parse('<<')), ['<', '<']);
  assert.deepStrictEqual(plain(Vimov.keys.parse('<C-S-d>')), ['<c-D>']);
  assert.deepStrictEqual(plain(Vimov.keys.parse('<c-->')), ['<c-->']);
  assert.throws(() => Vimov.keys.parse('<s-1>'), /shifted character/);
});

test('a shorter mapping that hides a longer one is a warning', () => {
  assert.deepStrictEqual(build('map g scrollDown').warnings, ['g is mapped, so gg, gu, gU, gr, gi, gt, gT, g0, g$ can never be typed']);
});

test('openUrl takes a text url with = in it', () => {
  const keymap = build('map gm openUrl url=https://x.example/?a=b newTab=true');
  assert.deepStrictEqual(keymap.errors, []);
  assert.deepStrictEqual(plain(keymap.bindings.get('g m').options), { url: 'https://x.example/?a=b', newTab: true });
});

test('openUrl without url is an error', () => {
  assert.strictEqual(build('map gm openUrl').errors[0]?.message, 'openUrl needs url=…');
});

test('search rejects an unknown source', () => {
  assert.match(build('map gb search in=everything').errors[0]?.message || '', /in must be one of: all, tabs, bookmarks, history/);
});

test('names inherited by every object are not commands or options', () => {
  const keymap = build('map x toString\nmap y valueOf\nmap z constructor\nmap R reload constructor=1');
  assert.deepStrictEqual(keymap.errors.map((e) => e.message), [
    'Unknown command "toString"',
    'Unknown command "valueOf"',
    'Unknown command "constructor"',
    'reload has no option "constructor"',
  ]);
  assert.strictEqual(keymap.bindings.get('x').command, 'closeTab'); // the default stays
  assert.strictEqual(keymap.bindings.has('y'), false);
});

test('descriptions', () => {
  assert.strictEqual(Vimov.describeCommand('search', {}), 'Search tabs, bookmarks, history and the web');
  assert.strictEqual(Vimov.describeCommand('search', { in: 'bookmarks', newTab: true }), 'Search bookmarks, opening in a new tab');
  assert.strictEqual(Vimov.describeCommand('openUrl', { url: 'mail.google.com' }), 'Open mail.google.com');
  assert.strictEqual(Vimov.describeCommand('openClipboard', { newTab: true }), 'Open the URL on the clipboard in a new tab, or search for its text');
});

test('exclusion patterns', () => {
  const cases = [
    ['mail.google.com', 'https://mail.google.com/mail/u/0', true],
    ['mail.google.com', 'https://mail.google.com', true],
    ['mail.google.com', 'https://mail.google.com:8443/x', true],
    ['mail.google.com', 'https://mail.google.com?x', true],
    ['mail.google.com', 'https://mail.google.com.evil.example/', false],
    ['mail.google.com', 'https://mail.google.community/', false],
    ['localhost:3000', 'http://localhost:3000/app', true],
    ['localhost:3000', 'http://localhost:30001/', false],
    ['localhost', 'http://localhost:5173/', true],
    ['*.google.com', 'https://docs.google.com/d/1', true],
    ['*.google.com', 'https://google.com.evil/', false],
    ['github.com/me', 'https://github.com/me/repo', true],
    ['example.com/docs/', 'https://example.com/docs/page', true],
    ['https://example.com/', 'https://example.com/', true],
    ['https://example.com/', 'https://example.com/x', false],
    ['google.*', 'https://google.co.uk/', true],
    ['*', 'https://anything.example/', true],
    ['*', 'http://localhost:8080/a?b#c', true],
    ['https://example.com', 'https://example.com/x', true],
    ['https://example.com', 'http://example.com/', false],
    ['*://example.com/*', 'http://example.com/x', true],
    // A star stays within its part, so another site naming this one in its
    // URL isn't excluded.
    ['mail.google.com', 'https://web.archive.org/web/2024/https://mail.google.com/mail/', false],
    ['mail.google.com', 'https://www.google.com/search?q=https://mail.google.com', false],
    ['*.youtube.com', 'https://example.com/a.youtube.com', false],
    ['*.youtube.com', 'https://www.youtube.com/watch?v=x', true],
    ['google.*', 'https://example.com/google.com', false],
  ];
  for (const [pattern, url, excluded] of cases) {
    const { rules } = Vimov.keys.parseExclusions(pattern);
    assert.strictEqual(!!Vimov.keys.matchExclusion(rules, url), excluded, `${pattern} vs ${url}`);
  }
});

test('exclusions can pass some keys through', () => {
  const { rules, errors } = Vimov.keys.parseExclusions('# comment\nmail.google.com j k <c-d>\n');
  assert.deepStrictEqual(plain(errors), []);
  assert.deepStrictEqual([...rules[0].passKeys], ['j', 'k', '<c-d>']);
});

test('the toolbar button finds the rule for a page', () => {
  const site = (text, url) => {
    const found = Vimov.keys.siteExclusion(text, url);
    return found && { host: found.host, pattern: found.rule?.pattern ?? null, own: found.own };
  };
  assert.strictEqual(site('', 'about:addons'), null);
  assert.strictEqual(site('', 'not a url'), null);
  assert.deepStrictEqual(site('', 'https://example.com/a'), { host: 'example.com', pattern: null, own: false });
  assert.deepStrictEqual(site('example.com', 'https://example.com/a'), { host: 'example.com', pattern: 'example.com', own: true });
  assert.deepStrictEqual(site('Example.com', 'https://example.com/'), { host: 'example.com', pattern: 'Example.com', own: true });
  assert.deepStrictEqual(site('localhost:3000', 'http://localhost:3000/'), { host: 'localhost:3000', pattern: 'localhost:3000', own: true });
  assert.deepStrictEqual(site('*.google.com', 'https://mail.google.com/'), { host: 'mail.google.com', pattern: '*.google.com', own: false });
  assert.deepStrictEqual(site('example.com j k', 'https://example.com/'), { host: 'example.com', pattern: 'example.com', own: false });
});

test('the toolbar button adds or removes the host on its own line', () => {
  const toggle = Vimov.keys.toggleSite;
  assert.strictEqual(toggle('', 'example.com'), 'example.com');
  assert.strictEqual(toggle('# mine\nmail.google.com j k\n\n', 'example.com'), '# mine\nmail.google.com j k\nexample.com');
  assert.strictEqual(toggle('a.com\nexample.com\nb.com', 'example.com'), 'a.com\nb.com');
  assert.strictEqual(toggle('  Example.com  \nexample.com j', 'example.com'), 'example.com j');
});

test('keys pressed with Ctrl or Alt, on any layout', () => {
  const key = (key, code, mods = {}) => Vimov.keys.fromEvent({
    key, code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, getModifierState: () => false, ...mods,
  });
  const ctrl = { ctrlKey: true };
  assert.strictEqual(key('j', 'KeyJ', ctrl), '<c-j>');
  // Dvorak's J and AZERTY's A sit where QWERTY has C and Q.
  assert.strictEqual(key('j', 'KeyC', ctrl), '<c-j>');
  assert.strictEqual(key('a', 'KeyQ', ctrl), '<c-a>');
  // Shift makes a capital; Caps Lock doesn't.
  assert.strictEqual(key('D', 'KeyD', { ctrlKey: true, shiftKey: true }), '<c-D>');
  assert.strictEqual(key('J', 'KeyJ', ctrl), '<c-j>');
  // Option+P types π on a Mac, and a Russian layout types о where J is:
  // both are read from the physical key.
  assert.strictEqual(key('π', 'KeyP', { altKey: true }), '<a-p>');
  assert.strictEqual(key('о', 'KeyJ', ctrl), '<c-j>');
  assert.strictEqual(key('!', 'Digit1', { ctrlKey: true, shiftKey: true }), '<c-1>');
  assert.strictEqual(key('Dead', 'KeyE', { altKey: true }), '<a-e>');
  // Without a modifier, the character typed.
  assert.strictEqual(key('J', 'KeyJ', { shiftKey: true }), 'J');
  assert.strictEqual(key('$', 'Digit4', { shiftKey: true }), '$');
});
