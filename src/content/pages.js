'use strict';

// nextPage and previousPage (} and { by default): follow the link to the next
// or previous page of search results, a list or a series of articles.

Vimov.pages = (() => {
  const { dom, ui } = Vimov;

  // How a link to the next or previous page is marked or labelled, best
  // first: rel="next", then a word at the start of its text, then an arrow on
  // its own or at the end (the start, for previous). Newer counts as next and
  // older as previous, as in Vimium and Tridactyl.
  const REL = { next: ['next'], previous: ['prev', 'previous'] };
  const PATTERNS = {
    next: [/^next\b/i, /^newer\b/i, /^(?:>|›|→|»|≫|>>)$/, /(?:>|›|→|»|≫)$/, /^more$/i],
    previous: [/^prev(?:ious)?\b/i, /^older\b/i, /^(?:<|‹|←|«|≪|<<)$/, /^(?:<|‹|←|«|≪)/],
  };
  // Longer text is more often a headline that happens to start with "Next".
  const MAX_LABEL = 30;

  const CANDIDATES = [
    'a[href]', 'area[href]', 'link[href]', 'button', 'input[type="button"]', 'input[type="submit"]',
    '[role="link"]', '[role="button"]',
  ].join(',');

  // The index of the best link among { label, rel } descriptions, or -1. A
  // link marked with rel wins; otherwise the first link matching the earliest
  // pattern.
  function choose(links, dir) {
    const marked = links.findIndex((link) => REL[dir].some((r) => link.rel.includes(r)));
    if (marked !== -1) return marked;
    for (const pattern of PATTERNS[dir]) {
      const i = links.findIndex(({ label }) => label.length <= MAX_LABEL && pattern.test(label));
      if (i !== -1) return i;
    }
    return -1;
  }

  const describe = (el) => ({
    label: (el.getAttribute('aria-label') || el.innerText || el.value || el.alt || el.title || el.querySelector('img[alt]')?.alt || '')
      .replace(/\s+/g, ' ')
      .trim(),
    rel: (el.getAttribute('rel') || '').toLowerCase().split(/\s+/),
  });

  // Links and buttons that could be followed, in document order, including
  // ones in shadow roots and ones scrolled out of view. <link> elements in the
  // head count, for their rel.
  function candidates() {
    const found = [];
    const visit = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.matches(CANDIDATES) && (el.localName === 'link' || usable(el))) found.push(el);
        const shadow = dom.shadowRootOf(el);
        if (shadow) visit(shadow);
      }
    };
    visit(document);
    return found;
  }

  const usable = (el) =>
    !el.matches(':disabled, [aria-disabled="true"]') && el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });

  function follow(dir) {
    const links = candidates();
    const i = choose(links.map(describe), dir);
    if (i === -1) return ui.message(`No “${dir}” link on this page`);
    const el = links[i];
    if (el.localName === 'link') {
      if (/^https?:/.test(el.href)) location.href = el.href;
      return undefined;
    }
    const rect = dom.visibleRect(el);
    if (rect) ui.flash(rect);
    return dom.click(el);
  }

  return { follow, choose };
})();
