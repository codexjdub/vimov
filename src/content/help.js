'use strict';

// Help overlay: every mapped key, grouped by category, from the live keymap
// so it reflects the user's own mappings (src/shared/reference.js builds
// the list), then the keys inside the vbar, find and hints. / filters it.

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

  // Each section as a heading and its rows, or a line saying nothing matched.
  function render(columns, sections, query) {
    if (!sections.length) {
      columns.replaceChildren(el('p', 'none', `No keys match “${query.trim()}”`));
      return;
    }
    columns.replaceChildren(
      ...sections.map(({ category, rows }) => {
        const section = el('section');
        section.append(el('h2', '', category));
        for (const row of rows) {
          const line = el('div', 'row');
          line.append(keyCells(row.groups), el('span', '', row.description));
          section.append(line);
        }
        return section;
      }),
    );
  }

  function open() {
    const focused = document.activeElement;
    const backdrop = el('div', 'backdrop');
    const panel = el('div', 'help');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Vimov keys');

    // / starts filtering the rows by what you type, as find does on a page.
    const filterBox = el('input', 'filter');
    filterBox.spellcheck = false;
    filterBox.autocomplete = 'off';
    filterBox.placeholder = '/ to filter';
    filterBox.setAttribute('aria-label', 'Filter the keys');

    const header = el('header');
    const options = el('button', '', 'Options');
    header.append(el('h1', '', 'Vimov'), filterBox, el('span', 'note', 'Esc to close'), options);

    const sections = Vimov.keyReference.build(Vimov.state.keymap.bindings, Vimov.state.layout);
    const columns = el('div', 'columns');
    const show = () => render(columns, Vimov.keyReference.filter(sections, filterBox.value), filterBox.value);
    show();
    panel.append(header, columns);
    backdrop.append(panel);
    ui.root().append(backdrop);

    let filtering = false; // typing goes into the filter box
    let tookFocus = false;
    const clearFilter = () => {
      filterBox.value = '';
      show();
    };

    const mode = {
      name: 'help',
      onKey(key, event) {
        // Let browser shortcuts through.
        if (event?.ctrlKey || event?.metaKey) return false;
        if (filtering) {
          // Enter keeps the filter and goes back to scrolling; Esc drops it.
          if (key === '<esc>') clearFilter();
          if (key === '<esc>' || key === '<enter>') {
            filterBox.blur();
            return true;
          }
          return false; // typed into the box
        }
        const scrollKeys = { j: 60, k: -60, d: panel.clientHeight / 2, u: -panel.clientHeight / 2 };
        if (key === '/') filterBox.focus();
        else if (key === '<esc>' && filterBox.value) clearFilter();
        else if (key === '<esc>' || key === '?') Vimov.mode.exit(mode);
        else if (key in scrollKeys) panel.scrollBy({ top: scrollKeys[key] });
        return true;
      },
      onExit() {
        backdrop.remove();
        if (tookFocus) focused?.focus?.({ preventScroll: true });
      },
    };
    filterBox.addEventListener('focus', () => {
      filtering = true;
      tookFocus = true;
    });
    filterBox.addEventListener('blur', () => {
      filtering = false;
    });
    // Keep typing in the box from reaching the page's own listeners.
    filterBox.addEventListener('input', (e) => {
      e.stopPropagation();
      panel.scrollTop = 0;
      show();
    });
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
