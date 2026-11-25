'use strict';

// The page that opens once, when Vimov is first installed: how to start,
// then every key, from the same list as the help overlay
// (src/shared/reference.js).

(() => {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // The keys of a row: each group's keys, with a slash between groups.
  function keyCells(groups) {
    const cells = el('span', 'keys');
    groups.forEach((group, i) => {
      if (i) cells.append(el('span', 'or', '/'));
      cells.append(...group.map((notation) => el('kbd', '', Vimov.keyReference.text(notation))));
    });
    return cells;
  }

  function render(settings = Vimov.DEFAULT_SETTINGS, local = {}) {
    const layout = { verticalTabs: Vimov.verticalTabs(settings, local.firefoxVerticalTabs) };
    const { bindings } = Vimov.keys.buildKeymap(settings.keymap, layout);
    const groups = Vimov.keyReference.build(bindings, layout).map(({ category, rows }) => {
      const group = el('div', 'group');
      group.append(el('h3', '', category));
      for (const row of rows) {
        const line = el('div', 'row');
        line.append(keyCells(row.groups), el('span', '', row.description));
        group.append(line);
      }
      return group;
    });
    document.getElementById('reference').replaceChildren(...groups);
  }

  // Mappings and a tab layout synced from another computer show as they'll
  // work here.
  Promise.all([
    browser.storage.sync.get(Vimov.DEFAULT_SETTINGS),
    browser.storage.local.get({ firefoxVerticalTabs: false }),
  ]).then(([settings, local]) => render(settings, local), () => render());
  document.getElementById('options').addEventListener('click', () => browser.runtime.openOptionsPage());
})();
