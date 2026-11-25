'use strict';

// The list of keys that the help overlay (?) and the welcome page show,
// built from a keymap so it shows the user's own mappings. Opposite
// commands share a row ("j / k  Scroll down / up"), as do the same command
// here and in a new tab ("o / O"). The keys that work inside the vbar, find
// and hints, which can't be remapped, come after.

Vimov.keyReference = (() => {
  // Commands that share a row when both are mapped, with the row's text.
  const PAIRS = [
    ['scrollDown', 'scrollUp', 'Scroll down / up'],
    ['scrollLeft', 'scrollRight', 'Scroll left / right'],
    ['scrollHalfDown', 'scrollHalfUp', 'Scroll down / up half a page'],
    ['scrollPageDown', 'scrollPageUp', 'Scroll down / up a page'],
    ['scrollToTop', 'scrollToBottom', 'Scroll to the top / bottom'],
    ['scrollToLeft', 'scrollToRight', 'Scroll all the way left / right'],
    ['goBack', 'goForward', 'Go back / forward in history'],
    ['nextPage', 'previousPage', 'Follow the link to the next / previous page'],
    ['findNext', 'findPrevious', 'Go to the next / previous match'],
    ['nextTab', 'previousTab', 'Go one tab right / left'],
    ['firstTab', 'lastTab', 'Go to the first / last tab'],
    ['moveTabLeft', 'moveTabRight', 'Move the tab left / right'],
  ];

  // Keys inside Vimov's own boxes. Each row: groups of keys (a slash between
  // groups), then what they do.
  const INSIDE = [
    {
      category: 'In the vbar',
      rows: [
        [[['<c-j>'], ['<c-k>']], 'Next / previous result (Tab and the arrow keys too)'],
        [[['<enter>']], 'Open the result'],
        [[['<s-enter>']], 'Open it in a new tab, or in this tab from O and B'],
        [[['<s-delete>']], 'Close the tab or remove the history entry'],
        [[['*', '%', '^', '?']], 'Search only bookmarks, tabs, history or the web'],
      ],
    },
    {
      category: 'In find',
      rows: [
        [[['<enter>']], 'Go to the match; Enter again follows a link there'],
        [[['<c-j>'], ['<c-k>']], 'Next / previous match while typing'],
        [[['<esc>']], 'Cancel and go back to where you were'],
      ],
    },
    {
      category: 'In link hints',
      rows: [
        [[['<backspace>']], 'Take back the last letter typed'],
        [[['<esc>']], 'Cancel'],
      ],
    },
  ];

  // Options without newTab, as text, to spot two mappings of the same
  // command that differ only in opening a new tab.
  const sameBut = (options) =>
    JSON.stringify(Object.keys(options).filter((k) => k !== 'newTab').sort().map((k) => [k, options[k]]));

  // [{ category, rows: [{ groups: [[key, …], …], description }] }], with rows
  // in command-registry order. Keys are written in Vimov's notation (gg, <c-j>).
  function build(bindings) {
    const rows = [];
    const byId = new Map();
    for (const { keys, command, options } of bindings.values()) {
      const description = Vimov.describeCommand(command, options);
      const id = `${command}\n${description}`;
      if (!byId.has(id)) {
        const row = { command, options, description, groups: [[]] };
        byId.set(id, row);
        rows.push(row);
      }
      byId.get(id).groups[0].push(keys.join(''));
    }

    const plain = (command) => rows.find((r) => r.command === command && !Object.keys(r.options).length);
    const merge = (first, second, description) => {
      first.groups.push(...second.groups);
      first.description = description;
      rows.splice(rows.indexOf(second), 1);
    };
    for (const [a, b, description] of PAIRS) {
      const first = plain(a);
      const second = plain(b);
      if (first && second) merge(first, second, description);
    }
    for (const second of rows.filter((r) => r.options.newTab === true)) {
      const first = rows.find((r) => r !== second && r.command === second.command && !r.options.newTab && sameBut(r.options) === sameBut(second.options));
      if (first && first.groups.length === 1) merge(first, second, `${first.description}, here / in a new tab`);
    }

    const order = Object.keys(Vimov.COMMANDS);
    const sections = Vimov.CATEGORIES.map((category) => ({
      category,
      rows: rows
        .filter((row) => Vimov.COMMANDS[row.command].category === category)
        .sort((x, y) => order.indexOf(x.command) - order.indexOf(y.command))
        .map(({ groups, description }) => ({ groups, description })),
    })).filter((section) => section.rows.length);
    const inside = INSIDE.map(({ category, rows: list }) => ({
      category,
      rows: list.map(([groups, description]) => ({ groups, description })),
    }));
    return [...sections, ...inside];
  }

  // One key as people write it: <c-j> as Ctrl+J, <c-D> as Ctrl+Shift+D.
  const NAMES = { esc: 'Esc', enter: 'Enter', tab: 'Tab', space: 'Space', backspace: 'Backspace', delete: 'Delete', pageup: 'PageUp', pagedown: 'PageDown' };
  const MODS = { a: 'Alt', c: 'Ctrl', m: 'Meta', s: 'Shift' };
  function label(key) {
    const m = /^<(.+)>$/.exec(key);
    if (!m) return key;
    const inner = m[1];
    const minus = inner.endsWith('--');
    const parts = (minus ? inner.slice(0, -2) : inner).split('-');
    const base = minus ? '-' : parts.pop();
    const mods = parts.filter(Boolean).map((p) => MODS[p] || p);
    let name = NAMES[base] || base[0].toUpperCase() + base.slice(1);
    if (base.length === 1 && base !== base.toLowerCase()) mods.push('Shift');
    if (base.length === 1) name = base.toUpperCase();
    return [...mods, name].join('+');
  }

  // A mapping's keys, written in Vimov's notation ("gg", "<a-p>",
  // "g<c-d>"), as shown to people: "gg", "Alt+P", "g Ctrl+D".
  function text(notation) {
    const keys = Vimov.keys.parse(notation);
    return keys.some((key) => key.length > 1) ? keys.map(label).join(' ') : notation;
  }

  return { build, text };
})();
