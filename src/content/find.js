'use strict';

// Find mode: search as you type with every match highlighted, then n and N to
// step between matches (Ctrl+J and Ctrl+K while still typing). Matching is smartcase (case-sensitive only when the
// query has a capital letter) and treats any run of spaces as any whitespace.

Vimov.find = (() => {
  const { ui } = Vimov;
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'select', 'option', 'datalist']);
  const MAX_MATCHES = 2000;
  // The CSS Custom Highlight API paints matches without touching the DOM.
  // Without it, only the current match is shown, as the selection.
  const registry = typeof Highlight === 'function' ? globalThis.CSS?.highlights : null;

  let lastQuery = '';
  let current = null; // Range of the current match
  let currentLink = null; // the link select() focused for it
  let painted = false;

  // The page's visible text as one string, with the text node each part came from.
  function textIndex() {
    const nodes = [];
    const starts = [];
    let text = '';
    const visibility = new Map();
    const isVisible = (el) => {
      if (!visibility.has(el)) {
        visibility.set(el, el.checkVisibility?.({ checkVisibilityCSS: true, visibilityProperty: true }) ?? true);
      }
      return visibility.get(el);
    };
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.data || !parent || SKIP.has(parent.localName) || !isVisible(parent)) continue;
      nodes.push(node);
      starts.push(text.length);
      text += node.data;
    }
    return { nodes, starts, text };
  }

  // Index of the node holding offset `pos`. An end offset that falls on a node
  // boundary belongs to the node before it.
  function locate(starts, pos, isEnd) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (isEnd ? starts[mid] < pos : starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function search(query, { nodes, starts, text } = textIndex()) {
    if (!query) return [];
    const source = Vimov.keys.escapeRegExp(query).replace(/\s+/g, '\\s+');
    const flags = query === query.toLowerCase() ? 'giu' : 'gu';
    const ranges = [];
    for (const match of text.matchAll(new RegExp(source, flags))) {
      const end = match.index + match[0].length;
      const first = locate(starts, match.index, false);
      const last = locate(starts, end, true);
      const range = document.createRange();
      range.setStart(nodes[first], match.index - starts[first]);
      range.setEnd(nodes[last], end - starts[last]);
      ranges.push(range);
      if (ranges.length === MAX_MATCHES) break;
    }
    return ranges;
  }

  function paint(ranges, cur) {
    if (!registry) return;
    registry.set('vimov-find', new Highlight(...ranges));
    const highlight = new Highlight(...(cur ? [cur] : []));
    highlight.priority = 1;
    registry.set('vimov-find-current', highlight);
    painted = true;
  }

  const sameRange = (a, b) => {
    try {
      return a.compareBoundaryPoints(Range.START_TO_START, b) === 0 && a.compareBoundaryPoints(Range.END_TO_END, b) === 0;
    } catch {
      return false; // in different trees
    }
  };

  // Removes the highlights, and the selection and link focus the current
  // match left, unless the user has moved them since. The selection collapses
  // to the match's start rather than going, so n and N carry on from there.
  // Returns whether there were highlights.
  function clear() {
    const had = painted;
    registry?.delete('vimov-find');
    registry?.delete('vimov-find-current');
    painted = false;
    const selection = getSelection();
    if (current && selection.rangeCount === 1 && sameRange(selection.getRangeAt(0), current)) selection.collapseToStart();
    if (currentLink?.matches(':focus')) currentLink.blur();
    current = null;
    currentLink = null;
    return had;
  }

  function reveal(range) {
    const r = range.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth) return;
    range.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  }

  // Selects the match. A match inside a link also focuses the link, so Enter
  // follows it.
  function select(range) {
    const link = range.startContainer.parentElement?.closest('a[href]');
    currentLink = link || null;
    if (link) link.focus({ preventScroll: true });
    else if (document.activeElement !== document.body) document.activeElement?.blur?.();
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range.cloneRange());
  }

  function countText(matches, cur) {
    const total = `${matches.length}${matches.length === MAX_MATCHES ? '+' : ''}`;
    return `${matches.indexOf(cur) + 1}/${total}`;
  }

  function start() {
    // Clear the last search first, so its match isn't saved as the selection
    // to put back if this one is cancelled.
    clear();
    const saved = {
      x: scrollX,
      y: scrollY,
      focus: document.activeElement,
      ranges: Array.from({ length: getSelection().rangeCount }, (_, i) => getSelection().getRangeAt(i).cloneRange()),
    };
    const index = textIndex();

    const bar = document.createElement('div');
    bar.className = 'find';
    const input = document.createElement('input');
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Find in page');
    const counter = document.createElement('span');
    counter.className = 'count';
    bar.append(input, counter);
    ui.root().append(bar);

    let matches = [];
    function update() {
      matches = search(input.value, index);
      // Start from where the user was reading: the first match below the top
      // of the viewport as it was when find began.
      const shift = scrollY - saved.y;
      current = matches.find((r) => r.getBoundingClientRect().bottom + shift >= 0) || matches[0] || null;
      paint(matches, current);
      if (current) reveal(current);
      else scrollTo(saved.x, saved.y);
      counter.dataset.text = !input.value ? '' : current ? countText(matches, current) : 'No matches';
    }

    // Ctrl+J and Ctrl+K step through the matches without leaving the bar.
    function step(dir) {
      if (!matches.length) return;
      const n = matches.length;
      current = matches[(matches.indexOf(current) + dir + n) % n];
      paint(matches, current);
      reveal(current);
      counter.dataset.text = countText(matches, current);
    }

    // Keep typing in the bar from reaching the page's own listeners.
    input.addEventListener('input', (e) => {
      e.stopPropagation();
      update();
    });

    let outcome = 'keep'; // 'accept' on Enter, 'cancel' on Esc, 'keep' if focus moves away
    const mode = {
      name: 'find',
      onKey(key) {
        if (key === '<c-j>' || key === '<c-k>') {
          step(key === '<c-j>' ? 1 : -1);
          return true;
        }
        if (key !== '<esc>' && key !== '<enter>') return false;
        outcome = key === '<enter>' ? 'accept' : 'cancel';
        Vimov.mode.exit(mode);
        return true;
      },
      onExit() {
        const query = input.value;
        bar.remove();
        if (outcome === 'cancel' || !query) {
          clear();
          scrollTo(saved.x, saved.y);
          const selection = getSelection();
          selection.removeAllRanges();
          saved.ranges.forEach((range) => selection.addRange(range));
          saved.focus?.focus?.({ preventScroll: true });
          return;
        }
        lastQuery = query;
        if (outcome === 'accept') {
          if (current) select(current);
          else ui.message(`Not found: ${query}`);
        }
      },
    };
    input.addEventListener('blur', () => Vimov.mode.exit(mode));
    Vimov.mode.enter(mode);
    input.focus();
  }

  // The match `dir` steps from the current one, or from the selection, or
  // from the top of the viewport.
  function nextIndex(matches, dir) {
    const selection = getSelection();
    const anchor = current?.startContainer.isConnected
      ? current
      : selection.rangeCount
        ? selection.getRangeAt(0)
        : null;
    if (!anchor) {
      const i = matches.findIndex((r) => r.getBoundingClientRect().bottom >= 0);
      return dir > 0 ? Math.max(i, 0) : i > 0 ? i - 1 : matches.length - 1;
    }
    try {
      const after = (r) => r.compareBoundaryPoints(Range.START_TO_START, anchor) > 0;
      const before = (r) => r.compareBoundaryPoints(Range.START_TO_START, anchor) < 0;
      if (dir > 0) {
        const i = matches.findIndex(after);
        return i === -1 ? 0 : i;
      }
      const i = matches.findLastIndex(before);
      return i === -1 ? matches.length - 1 : i;
    } catch {
      // The anchor is somewhere a match can't be compared with (another root).
      return dir > 0 ? 0 : matches.length - 1;
    }
  }

  function next(dir, count = 1) {
    if (!lastQuery) {
      ui.message('No previous search');
      return;
    }
    const matches = search(lastQuery);
    if (!matches.length) {
      clear();
      ui.message(`Not found: ${lastQuery}`);
      return;
    }
    const n = matches.length;
    const i = (((nextIndex(matches, dir) + dir * (count - 1)) % n) + n) % n;
    current = matches[i];
    paint(matches, current);
    select(current);
    reveal(current);
    ui.message(countText(matches, current));
  }

  return { start, next, clear, search };
})();
