'use strict';

// Help overlay: every mapped key, grouped by category, built from the live
// keymap so it reflects the user's own mappings.

Vimov.help = (() => {
  const { ui } = Vimov;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // [{ category, rows: [{ command, description, keys }] }], with rows in
  // command-registry order and bindings that do the same thing merged.
  function sections() {
    const rows = new Map();
    for (const { keys, command, options } of Vimov.state.keymap.bindings.values()) {
      const description = Vimov.describeCommand(command, options);
      const id = `${command}\n${description}`;
      if (!rows.has(id)) rows.set(id, { command, description, keys: [] });
      rows.get(id).keys.push(keys.join(''));
    }
    const order = Object.keys(Vimov.COMMANDS);
    return Vimov.CATEGORIES.map((category) => ({
      category,
      rows: [...rows.values()]
        .filter((row) => Vimov.COMMANDS[row.command].category === category)
        .sort((a, b) => order.indexOf(a.command) - order.indexOf(b.command)),
    })).filter((section) => section.rows.length);
  }

  function open() {
    const backdrop = el('div', 'backdrop');
    const panel = el('div', 'help');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Vimov keys');

    const header = el('header');
    const options = el('button', '', 'Options');
    header.append(el('h1', '', 'Vimov'), el('span', 'note', 'Esc to close'), options);

    const columns = el('div', 'columns');
    for (const { category, rows } of sections()) {
      const section = el('section');
      section.append(el('h2', '', category));
      for (const row of rows) {
        const line = el('div', 'row');
        const keys = el('span', 'keys');
        keys.append(...row.keys.map((k) => el('kbd', '', k)));
        line.append(keys, el('span', '', row.description));
        section.append(line);
      }
      columns.append(section);
    }
    panel.append(header, columns);
    backdrop.append(panel);
    ui.root().append(backdrop);

    const mode = {
      name: 'help',
      onKey(key) {
        const scrollKeys = { j: 60, k: -60, d: panel.clientHeight / 2, u: -panel.clientHeight / 2 };
        if (key === '<esc>' || key === '?') Vimov.mode.exit(mode);
        else if (key in scrollKeys) panel.scrollBy({ top: scrollKeys[key] });
        return true;
      },
      onExit: () => backdrop.remove(),
    };
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) Vimov.mode.exit(mode);
    });
    options.addEventListener('click', () => {
      Vimov.mode.exit(mode);
      Vimov.bg('openOptions');
    });
    Vimov.mode.enter(mode);
  }

  return { open };
})();
