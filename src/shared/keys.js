'use strict';

// Key notation, keyboard-event conversion, and the parsers for the keymap and
// exclusion settings.
//
// A key is written as the character it types ("j", "G", "$") or as a name in
// angle brackets with optional modifiers: <esc>, <c-d>, <a-p>, <m-k>, <s-tab>.
// Shift is folded into letters, so Ctrl+Shift+D is <c-D>.

Vimov.keys = (() => {
  // Names accepted inside <…>, mapped to their canonical form.
  const NAMES = {
    esc: 'esc', escape: 'esc',
    enter: 'enter', return: 'enter', cr: 'enter',
    tab: 'tab', space: 'space',
    backspace: 'backspace', bs: 'backspace',
    delete: 'delete', del: 'delete', insert: 'insert',
    up: 'up', down: 'down', left: 'left', right: 'right',
    pageup: 'pageup', pagedown: 'pagedown', home: 'home', end: 'end',
  };
  // KeyboardEvent.key values of the named keys.
  const EVENT_NAMES = {
    Escape: 'esc', Enter: 'enter', Tab: 'tab', ' ': 'space', Backspace: 'backspace',
    Delete: 'delete', Insert: 'insert', ArrowUp: 'up', ArrowDown: 'down',
    ArrowLeft: 'left', ArrowRight: 'right', PageUp: 'pageup', PageDown: 'pagedown',
    Home: 'home', End: 'end',
  };
  const FUNCTION_KEY = /^f([1-9]|1\d|2[0-4])$/i;
  const MODIFIERS = ['a', 'c', 'm', 's'];

  const isChar = (s) => [...s].length === 1;
  const hasCase = (c) => c.toLowerCase() !== c.toUpperCase();
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Canonical form: a bare character when unmodified, otherwise <mods-base>
  // with modifiers in a-c-m-s order.
  function format(mods, base) {
    let m = [...new Set(mods)].sort();
    if (isChar(base) && hasCase(base) && m.includes('s')) {
      base = base.toUpperCase();
      m = m.filter((x) => x !== 's');
    }
    if (!m.length) return isChar(base) ? base : `<${base}>`;
    return `<${m.join('-')}-${base}>`;
  }

  // The key a keydown event represents, or null for modifier-only presses and
  // keys Vimov doesn't handle.
  function fromEvent(e) {
    const altGraph = e.getModifierState?.('AltGraph');
    const alt = e.altKey && !altGraph;
    const ctrl = e.ctrlKey && !altGraph;
    let base = EVENT_NAMES[e.key] || (FUNCTION_KEY.test(e.key) ? e.key.toLowerCase() : null);
    const named = base !== null;
    if (!named) {
      // With Alt or Ctrl, e.key can be a composed character (Option+P types
      // "π" on a Mac) or "Dead", so use the physical key instead.
      const physical = (alt || ctrl) && /^(?:Key([A-Z])|Digit(\d))$/.exec(e.code);
      if (physical) base = physical[1] ? (e.shiftKey ? physical[1] : physical[1].toLowerCase()) : physical[2];
      else if (isChar(e.key)) base = e.key;
      else return null;
    }
    const mods = [];
    if (alt) mods.push('a');
    if (ctrl) mods.push('c');
    if (e.metaKey) mods.push('m');
    if (named && e.shiftKey) mods.push('s');
    return format(mods, base);
  }

  function bracket(inner) {
    const parts = inner.split('-');
    let base = parts.pop();
    if (base === '' && parts.at(-1) === '') {
      // <c--> is Ctrl+minus.
      parts.pop();
      base = '-';
    }
    const mods = parts.map((p) => {
      const m = p.toLowerCase();
      if (!MODIFIERS.includes(m)) throw new Error(`Unknown modifier "${p}" in <${inner}>`);
      return m;
    });
    const name = base.toLowerCase();
    if (name === 'lt') base = '<';
    else if (NAMES[name]) base = NAMES[name];
    else if (FUNCTION_KEY.test(name)) base = name;
    else if (!isChar(base)) throw new Error(`Unknown key <${inner}>`);
    if (mods.includes('s') && isChar(base) && !hasCase(base)) {
      throw new Error(`Write the shifted character itself instead of <${inner}>`);
    }
    return format(mods, base);
  }

  // Splits notation like "g<c-d>x" into canonical keys. "<" stays a literal
  // character unless it starts a <…> key, so "<<" is two presses of "<".
  function parse(text) {
    const keys = [];
    for (let i = 0; i < text.length; ) {
      if (text[i] === '<') {
        const end = text.indexOf('>', i + 2);
        const inner = end === -1 ? '' : text.slice(i + 1, end);
        if (/^[\w-]+$/.test(inner) || /^(?:[acms]-)+.$/iu.test(inner)) {
          keys.push(bracket(inner));
          i = end + 1;
          continue;
        }
      }
      const ch = String.fromCodePoint(text.codePointAt(i));
      keys.push(ch);
      i += ch.length;
    }
    if (!keys.length) throw new Error('Empty key sequence');
    return keys;
  }

  // Non-blank, non-comment lines with their 1-based line numbers.
  function lines(text) {
    return String(text)
      .split('\n')
      .map((raw, i) => ({ line: raw.trim(), number: i + 1 }))
      .filter(({ line }) => line && !line.startsWith('#'));
  }

  function parseOptions(command, tokens) {
    const spec = Vimov.COMMANDS[command];
    if (!spec) throw new Error(`Unknown command "${command}"`);
    const options = {};
    for (const token of tokens) {
      const match = /^(\w+)=(.+)$/.exec(token);
      if (!match) throw new Error(`Expected option=value, got "${token}"`);
      const [, name, value] = match;
      const type = spec.options?.[name];
      if (!type) throw new Error(`${command} has no option "${name}"`);
      if (Array.isArray(type)) {
        if (!type.includes(value)) throw new Error(`${name} must be one of: ${type.join(', ')}`);
        options[name] = value;
      } else if (type === 'boolean') {
        if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false`);
        options[name] = value === 'true';
      } else if (type === 'string') {
        options[name] = value;
      } else {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`${name} must be a number`);
        options[name] = number;
      }
    }
    const missing = (spec.required || []).filter((name) => !(name in options));
    if (missing.length) throw new Error(`${command} needs ${missing.map((name) => `${name}=…`).join(' ')}`);
    return options;
  }

  function applyKeymap(text, bindings, errors) {
    for (const { line, number } of lines(text)) {
      const [verb, ...args] = line.split(/\s+/);
      try {
        if (verb === 'map') {
          if (args.length < 2) throw new Error('Expected: map <keys> <command> [option=value …]');
          const [keyText, command, ...options] = args;
          const keys = parse(keyText);
          bindings.set(keys.join(' '), { keys, command, options: parseOptions(command, options) });
        } else if (verb === 'unmap') {
          if (args.length !== 1) throw new Error('Expected: unmap <keys>');
          if (!bindings.delete(parse(args[0]).join(' '))) throw new Error(`${args[0]} isn't mapped`);
        } else if (verb === 'unmapAll') {
          if (args.length) throw new Error('unmapAll takes no arguments');
          bindings.clear();
        } else {
          throw new Error(`Unknown statement "${verb}"; use map, unmap or unmapAll`);
        }
      } catch (err) {
        errors.push({ line: number, message: err.message });
      }
    }
  }

  // The default mappings with the user's lines applied on top. Bindings are
  // keyed by their keys joined with spaces ("g g").
  function buildKeymap(userText = '') {
    const bindings = new Map();
    const defaultErrors = [];
    applyKeymap(Vimov.DEFAULT_KEYMAP, bindings, defaultErrors);
    if (defaultErrors.length) console.error('Vimov: bad default keymap', defaultErrors);

    const errors = [];
    applyKeymap(userText, bindings, errors);

    const prefixes = new Set();
    const shadowed = new Map(); // mapped key text → longer sequences it hides
    for (const { keys } of bindings.values()) {
      for (let i = 1; i < keys.length; i++) {
        const prefix = keys.slice(0, i);
        prefixes.add(prefix.join(' '));
        if (bindings.has(prefix.join(' '))) {
          const text = prefix.join('');
          if (!shadowed.has(text)) shadowed.set(text, []);
          shadowed.get(text).push(keys.join(''));
        }
      }
    }
    const warnings = [...shadowed].map(
      ([prefix, hidden]) => `${prefix} is mapped, so ${hidden.join(', ')} can never be typed`,
    );
    return { bindings, prefixes, errors, warnings };
  }

  // Exclusion rules: one per line, a URL pattern then optional keys to pass
  // through to the page. "*" matches anything. A pattern without a scheme
  // matches from the host onwards, so "mail.google.com" covers the whole site.
  function parseExclusions(text = '') {
    const rules = [];
    const errors = [];
    for (const { line, number } of lines(text)) {
      const [pattern, ...pass] = line.split(/\s+/);
      try {
        let glob = pattern.includes('://') ? pattern : `*://${pattern}`;
        if (!pattern.includes('://') && !glob.endsWith('*')) glob += '*';
        const re = new RegExp(`^${glob.split('*').map(escapeRegExp).join('.*')}$`, 'i');
        rules.push({ pattern, re, passKeys: new Set(pass.flatMap(parse)) });
      } catch (err) {
        errors.push({ line: number, message: err.message });
      }
    }
    return { rules, errors };
  }

  const matchExclusion = (rules, url) => rules.find((rule) => rule.re.test(url)) || null;

  return { fromEvent, parse, buildKeymap, parseExclusions, matchExclusion, escapeRegExp };
})();
