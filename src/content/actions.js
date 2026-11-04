'use strict';

// Command implementations. Each is called with (count, options, keyEvent);
// count is 1 when none was typed.

Vimov.actions = (() => {
  const { dom, ui, scroll } = Vimov;
  const settings = () => Vimov.state.settings;
  // Smooth scrolling animates a single press. A held j, k, h or l then glides
  // at this many steps a second; other held keys, and every key with smooth
  // scrolling off, jump on each repeat.
  const GLIDE_STEPS_PER_SECOND = 15;
  const smooth = (event) => settings().smoothScroll && !event?.repeat;
  const step = (n) => settings().scrollStep * n;

  // scrollDown and the like: a step per press (times the count), or a glide
  // while the key is held.
  const line = (axis, dir) => (n, _, e) => {
    if (e?.repeat && settings().smoothScroll) {
      return scroll.glide(axis, dir, step(GLIDE_STEPS_PER_SECOND), e.code);
    }
    return scroll.by(axis, { px: dir * step(n) }, smooth(e));
  };
  const tabCommand = (cmd) => (count) => Vimov.bg(cmd, { count });

  // The URL n levels up the path, without query or fragment.
  function upUrl(href, n) {
    const url = new URL(href);
    const parts = url.pathname.split('/').filter(Boolean);
    const kept = parts.slice(0, Math.max(0, parts.length - n));
    url.pathname = kept.length ? `/${kept.join('/')}/` : '/';
    url.search = '';
    url.hash = '';
    return url.href;
  }

  function navigate(href) {
    if (href !== location.href) location.href = href;
  }

  return {
    scrollDown: line('y', 1),
    scrollUp: line('y', -1),
    scrollLeft: line('x', -1),
    scrollRight: line('x', 1),
    scrollHalfDown: (n, _, e) => scroll.by('y', { pages: n / 2 }, smooth(e)),
    scrollHalfUp: (n, _, e) => scroll.by('y', { pages: -n / 2 }, smooth(e)),
    scrollPageDown: (n, _, e) => scroll.by('y', { pages: n }, smooth(e)),
    scrollPageUp: (n, _, e) => scroll.by('y', { pages: -n }, smooth(e)),
    scrollToTop: (n, _, e) => scroll.to('y', false, smooth(e)),
    scrollToBottom: (n, _, e) => scroll.to('y', true, smooth(e)),
    scrollToLeft: (n, _, e) => scroll.to('x', false, smooth(e)),
    scrollToRight: (n, _, e) => scroll.to('x', true, smooth(e)),

    goBack: (n) => history.go(-n),
    goForward: (n) => history.go(n),
    reload: (n, { hard }) => Vimov.bg('reload', { hard }),
    goUp: (n) => navigate(upUrl(location.href, n)),
    goRoot: () => navigate(new URL('/', location.href).href),
    copyUrl: () => Vimov.copyText(location.href),

    focusInput: (n) => {
      const fields = dom.textEntries();
      if (!fields.length) return ui.message('No text fields in view');
      const el = fields[Math.min(n, fields.length) - 1];
      el.focus();
      ui.flash(dom.visibleRect(el));
    },

    openUrl: (n, { url, newTab }) => {
      const href = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).href;
      if (newTab) return Vimov.bg('openUrl', { url: href, active: true });
      return navigate(href);
    },

    enterInsertMode: () => {
      const mode = {
        name: 'insert',
        status: '-- INSERT --',
        shield: false,
        onKey(key) {
          if (key !== '<esc>') return false;
          Vimov.mode.exit(mode);
          return true;
        },
      };
      Vimov.mode.enter(mode);
    },

    linkHints: (n, { action }) => Vimov.hints.start(action),

    find: () => Vimov.find.start(),
    findNext: (n) => Vimov.find.next(1, n),
    findPrevious: (n) => Vimov.find.next(-1, n),

    // The bar opens in the top frame; from an iframe, the background page passes it up.
    search: (n, options) => (window.top === window ? Vimov.search.open(options) : Vimov.bg('openSearch', options)),

    nextTab: tabCommand('nextTab'),
    previousTab: tabCommand('previousTab'),
    firstTab: tabCommand('firstTab'),
    lastTab: tabCommand('lastTab'),
    newTab: tabCommand('newTab'),
    closeTab: tabCommand('closeTab'),
    restoreTab: tabCommand('restoreTab'),
    duplicateTab: tabCommand('duplicateTab'),
    moveTabLeft: (n) => Vimov.bg('moveTab', { count: -n }),
    moveTabRight: (n) => Vimov.bg('moveTab', { count: n }),
    togglePinTab: tabCommand('togglePinTab'),

    showHelp: () => Vimov.help.open(),
    openOptions: () => Vimov.bg('openOptions'),
  };
})();
