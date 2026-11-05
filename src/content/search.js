'use strict';

// The vbar: one box for open tabs, bookmarks, history and the web. The
// background page finds and ranks the results (src/sources.js); this draws
// them and handles the keys.

Vimov.search = (() => {
  const { ui } = Vimov;
  const { el } = ui;
  const TAGS = { tab: 'Tab', bookmark: 'Bookmark', folder: 'Folder', history: 'History', site: 'Site', web: 'Search', url: 'Open' };
  const SYMBOLS = new Set(['*', '%', '^', '?']);
  const CONFIRM_TABS = 10; // a folder with more bookmarks than this asks first

  // `text` with the typed words in bold.
  function marked(text, words) {
    const span = el('span');
    if (!words.length) {
      span.textContent = text;
      return span;
    }
    const sorted = [...words].sort((a, b) => b.length - a.length).map(Vimov.keys.escapeRegExp);
    let last = 0;
    for (const m of text.matchAll(new RegExp(sorted.join('|'), 'giu'))) {
      span.append(text.slice(last, m.index), el('b', '', m[0]));
      last = m.index + m[0].length;
    }
    span.append(text.slice(last));
    return span;
  }

  const shortUrl = (url) => url.replace(/^https?:\/\//, '');

  function row(result, words) {
    const item = el('li', 'result');
    item.setAttribute('role', 'option');
    const title = result.title || result.url || 'Untitled';
    let detail = [result.folder, result.url && shortUrl(result.url)].filter(Boolean).join(' · ');
    if (result.type === 'web') detail = `Search with ${result.engine}`;
    else if (result.type === 'url') detail = 'Go to this address';
    else if (result.type === 'folder') {
      detail = [result.folder, `${result.count} bookmark${result.count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    }
    const text = el('span', 'text');
    const titleLine = marked(title, words);
    titleLine.className = 'title';
    const detailLine = result.type === 'web' ? el('span', '', detail) : marked(detail, words);
    detailLine.className = 'detail';
    text.append(titleLine, detailLine);
    item.append(el('span', `tag ${result.type}`, TAGS[result.type]), text);
    return item;
  }

  function hint(keys, label) {
    const span = el('span');
    span.append(el('kbd', '', keys), ` ${label}`);
    return span;
  }

  // Opens the bar. `in` limits it to one source; `newTab` makes Enter open
  // results in a new tab (Shift+Enter does the other).
  function open({ in: source = 'all', newTab = false } = {}) {
    const focused = document.activeElement;
    const backdrop = el('div', 'backdrop top');
    const panel = el('div', 'search');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Vimov search');
    const input = el('input');
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = Vimov.SEARCH_SOURCES[source] || Vimov.SEARCH_SOURCES.all;
    input.setAttribute('aria-label', input.placeholder);
    const list = el('ol', 'results');
    list.setAttribute('role', 'listbox');
    const footer = el('div', 'footer');
    const keys = [
      hint('Ctrl+J/K', 'move'),
      hint('*', 'bookmarks'),
      hint('%', 'tabs'),
      hint('^', 'history'),
      hint('?', 'web'),
      hint('Shift+Enter', newTab ? 'this tab' : 'new tab'),
      hint('Shift+Del', 'remove'),
    ];
    panel.append(input, list, footer);
    backdrop.append(panel);
    ui.root().append(backdrop);

    let results = [];
    let selected = 0;
    let confirming = null; // a big folder waiting for a second Enter
    let request = 0;
    let pending = null; // the request for what's in the box now, until it's answered
    let chosen = false;

    const typedWords = () => input.value.trim().split(/\s+/).filter((w) => w && !SYMBOLS.has(w));

    function showFooter() {
      if (confirming) footer.replaceChildren(hint('Enter', `again to open ${confirming.count} tabs`));
      else footer.replaceChildren(...keys);
    }

    function select(i) {
      selected = i;
      confirming = null;
      [...list.children].forEach((item, j) => {
        item.classList.toggle('selected', j === i);
        item.setAttribute('aria-selected', String(j === i));
      });
      list.children[i]?.scrollIntoView({ block: 'nearest' });
      showFooter();
    }

    function render() {
      const words = typedWords();
      list.replaceChildren(
        ...results.map((result, i) => {
          const item = row(result, words);
          item.addEventListener('mousemove', () => selected !== i && select(i));
          item.addEventListener('click', (e) => choose(i, e.shiftKey));
          return item;
        }),
      );
      list.hidden = !results.length;
      select(Math.min(selected, Math.max(results.length - 1, 0)));
    }

    // Asks the background page for results. Answers to older queries that
    // arrive late are dropped.
    function update({ keepSelection = false } = {}) {
      const id = ++request;
      pending = Vimov.bg('search', { query: input.value, in: source }).then((response) => {
        if (id !== request || !backdrop.isConnected) return;
        pending = null;
        results = response?.result || [];
        if (!keepSelection) selected = 0;
        render();
      });
    }

    function choose(i, flip) {
      const result = results[i];
      if (!result || !backdrop.isConnected) return;
      if (result.type === 'folder') {
        if (!result.count) return ui.message('No bookmarks in this folder');
        if (result.count > CONFIRM_TABS && confirming !== result) {
          confirming = result;
          return showFooter();
        }
      }
      chosen = true;
      Vimov.mode.exit(mode);
      Vimov.bg('openResult', { result, newTab: newTab !== flip });
    }

    async function removeSelected() {
      const result = results[selected];
      if (result?.type !== 'tab' && result?.type !== 'history') {
        ui.message('Only tabs and history entries can be removed');
        return;
      }
      if ((await Vimov.bg('removeResult', { result }))?.ok) update({ keepSelection: true });
    }

    const move = (by) => results.length && select((selected + by + results.length) % results.length);

    const mode = {
      name: 'search',
      onKey(key) {
        switch (key) {
          case '<esc>':
            Vimov.mode.exit(mode);
            return true;
          case '<down>':
          case '<tab>':
          case '<c-j>':
            move(1);
            return true;
          case '<up>':
          case '<s-tab>':
          case '<c-k>':
            move(-1);
            return true;
          case '<enter>':
          case '<s-enter>':
            // Typed fast, Enter can come before the results for the last
            // letters; wait for them so it opens the right thing.
            Promise.resolve(pending).then(() => choose(selected, key === '<s-enter>'));
            return true;
          case '<s-delete>':
            removeSelected();
            return true;
          default:
            return false; // typed into the box
        }
      },
      onExit() {
        backdrop.remove();
        if (!chosen) focused?.focus?.({ preventScroll: true });
      },
    };

    // Keep typing in the box from reaching the page's own listeners.
    input.addEventListener('input', (e) => {
      e.stopPropagation();
      update();
    });
    input.addEventListener('blur', () => Vimov.mode.exit(mode));
    // Clicks inside the panel keep focus in the box; clicks outside close it.
    panel.addEventListener('mousedown', (e) => {
      if (e.target !== input) e.preventDefault();
    });
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) Vimov.mode.exit(mode);
    });

    showFooter();
    Vimov.mode.enter(mode);
    input.focus();
    update();
  }

  return { open };
})();
