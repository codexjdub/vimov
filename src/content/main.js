'use strict';

// Entry point: loads settings and routes each key press to the active modal
// mode, the focused text field, or the keymap.

(() => {
  const { dom, keys, mode, ui, state } = Vimov;
  const MAX_COUNT = 9999;

  let pending = []; // keys of a partly typed sequence
  let count = ''; // digits typed before a command
  // event.code → how to treat the keypress and keyup that follow a keydown we
  // handled: 'consume' blocks them entirely, 'shield' only hides them from the page.
  const followups = new Map();

  // `local` holds what the background page read of Firefox's own settings.
  function applySettings(stored, local = {}) {
    const defaults = Vimov.DEFAULT_SETTINGS;
    const settings = { ...defaults, ...stored };
    settings.hintChars = Vimov.normalizeHintChars(settings.hintChars) || defaults.hintChars;
    settings.scrollStep = Math.max(1, Number(settings.scrollStep) || defaults.scrollStep);
    state.settings = settings;
    state.layout = { verticalTabs: Vimov.verticalTabs(settings, local.firefoxVerticalTabs) };
    state.keymap = keys.buildKeymap(settings.keymap, state.layout);
    state.exclusions = keys.parseExclusions(settings.exclusions).rules;
    state.exclusionUrl = null;
  }

  function loadSettings() {
    Promise.all([
      browser.storage.sync.get(Vimov.DEFAULT_SETTINGS),
      browser.storage.local.get({ firefoxVerticalTabs: false }),
    ]).then(([stored, local]) => applySettings(stored, local), () => applySettings({}));
  }

  // The exclusion rule for this page, if any. Single-page apps change the URL
  // without reloading, so it's looked up again whenever the URL changes.
  function exclusion() {
    if (state.exclusionUrl !== location.href) {
      state.exclusionUrl = location.href;
      state.exclusion = keys.matchExclusion(state.exclusions, location.href);
    }
    return state.exclusion;
  }

  // Half a second into a partly typed sequence, the keys that can follow it
  // are listed above the HUD (after g: gg to the top, gt the next tab…).
  // Typed at speed, it never shows.
  const NEXT_DELAY = 500;
  let nextTimer = 0;

  // [{ key, description }] for each key that can follow what's been typed,
  // in keymap order; "…" for one that starts a longer sequence.
  function continuations() {
    const next = new Map();
    for (const { keys: seq, command, options } of state.keymap.bindings.values()) {
      if (seq.length <= pending.length || pending.some((key, i) => seq[i] !== key)) continue;
      const key = Vimov.keyReference.text([...pending, seq[pending.length]].join(''));
      const complete = seq.length === pending.length + 1;
      if (complete) next.set(key, Vimov.describeCommand(command, options, state.layout));
      else if (!next.has(key)) next.set(key, '…');
    }
    return [...next].map(([key, description]) => ({ key, description }));
  }

  function showPending() {
    if (!mode.current) ui.setStatus(count + pending.join(''));
    clearTimeout(nextTimer);
    ui.showNext([]);
    if (pending.length && !mode.current) nextTimer = setTimeout(() => ui.showNext(continuations()), NEXT_DELAY);
  }

  function resetPending() {
    if (!pending.length && !count) return;
    pending = [];
    count = '';
    showPending();
  }

  // Largitude, an image-viewer extension, has keys of its own while its
  // popup is open (? lists them, o opens the image, r turns it, f flips it).
  // Its key listener runs after Vimov's, so Vimov leaves every key to the
  // page until the popup closes.
  const viewerOpen = () => !!document.querySelector('largitude-popup:popover-open');

  function block(event, how) {
    if (how === 'consume') event.preventDefault();
    event.stopImmediatePropagation();
    followups.set(event.code, how);
  }

  function onFollowup(event) {
    const how = followups.get(event.code);
    if (!how) return;
    if (how === 'consume') event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'keyup') followups.delete(event.code);
  }

  // A command that fails unexpectedly says what didn't work, in the words of
  // the help ("Couldn’t reload the page"); the details go to the console.
  function failed(command, options, err) {
    console.error('Vimov:', err);
    const what = Vimov.describeCommand(command, options, state.layout);
    ui.message(`Couldn’t ${what[0].toLowerCase()}${what.slice(1)}`);
  }

  function run({ command, options }, n, event) {
    try {
      const result = Vimov.actions[command](n, options, event);
      result?.catch?.((err) => failed(command, options, err));
    } catch (err) {
      failed(command, options, err);
    }
  }

  function onKeydown(event) {
    if (!event.isTrusted || !state.settings || event.isComposing) return;
    // A fresh press starts over. The keyup that would have cleared an entry
    // can land in another tab when the command switched tabs.
    followups.delete(event.code);
    let key = keys.fromEvent(event);
    if (!key) return;
    if (key === '<c-[>') key = '<esc>';

    const modal = mode.current;
    if (modal) {
      if (modal.onKey(key, event)) block(event, 'consume');
      else if (modal.shield !== false) block(event, 'shield');
      return;
    }

    if (viewerOpen()) {
      resetPending();
      return;
    }

    const rule = exclusion();
    if (rule && !rule.passKeys.size) return;

    const active = dom.deepActiveElement();
    if (dom.isEditable(active)) {
      if (key === '<esc>') {
        active.blur();
        block(event, 'consume');
      }
      return;
    }

    if (key === '<esc>') {
      const hadPending = pending.length || count;
      resetPending();
      // Esc only reaches the page when Vimov had nothing to cancel.
      if (Vimov.find.clear() || hadPending) block(event, 'consume');
      return;
    }

    // Before counts, so digits passed through (a video's seek keys) reach the page.
    if (!pending.length && rule?.passKeys.has(key)) {
      resetPending();
      return;
    }

    const { bindings, prefixes } = state.keymap;

    const startsCount = count || key !== '0';
    if (!pending.length && /^\d$/.test(key) && startsCount && !bindings.has(key) && !prefixes.has(key)) {
      count = String(Math.min(Number(count + key), MAX_COUNT));
      showPending();
      block(event, 'consume');
      return;
    }

    let id = [...pending, key].join(' ');
    if (pending.length && !bindings.has(id) && !prefixes.has(id)) {
      // The sequence broke off; start over from this key, as Vim does.
      pending = [];
      count = '';
      showPending();
      id = key;
    }

    if (bindings.has(id)) {
      const n = Number(count) || 1;
      pending = [];
      count = '';
      showPending();
      block(event, 'consume');
      run(bindings.get(id), n, event);
    } else if (prefixes.has(id)) {
      pending.push(key);
      showPending();
      block(event, 'consume');
    } else {
      resetPending();
    }
  }

  addEventListener('keydown', onKeydown, true);
  addEventListener('keypress', onFollowup, true);
  addEventListener('keyup', onFollowup, true);

  loadSettings();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' || (area === 'local' && changes.firefoxVerticalTabs)) loadSettings();
  });
  // From the background page: the vbar, asked for from an iframe in this
  // tab, and where this tab is after a tab command brought it to the front.
  browser.runtime.onMessage.addListener((message) => {
    if (window.top !== window) return;
    if (message?.cmd === 'openSearch') Vimov.search.open(message);
    else if (message?.cmd === 'tabPosition') ui.tabPosition(message);
  });
})();
