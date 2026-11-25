'use strict';

// Help overlay: every mapped key, grouped by category, from the live keymap
// so it reflects the user's own mappings (src/shared/reference.js builds
// the list), then the keys inside the vbar, find and hints.

Vimov.help = (() => {
  const { ui } = Vimov;
  const { el } = ui;

  // The keys of a row: each group's keys, with a slash between groups.
  function keyCells(groups) {
    const cells = el('span', 'keys');
    groups.forEach((group, i) => {
      if (i) cells.append(el('span', 'or', '/'));
      cells.append(...group.map((notation) => el('kbd', '', Vimov.keyReference.text(notation))));
    });
    return cells;
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
    for (const { category, rows } of Vimov.keyReference.build(Vimov.state.keymap.bindings, Vimov.state.layout)) {
      const section = el('section');
      section.append(el('h2', '', category));
      for (const row of rows) {
        const line = el('div', 'row');
        line.append(keyCells(row.groups), el('span', '', row.description));
        section.append(line);
      }
      columns.append(section);
    }
    panel.append(header, columns);
    backdrop.append(panel);
    ui.root().append(backdrop);

    const mode = {
      name: 'help',
      onKey(key, event) {
        // Let browser shortcuts through.
        if (event?.ctrlKey || event?.metaKey) return false;
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
