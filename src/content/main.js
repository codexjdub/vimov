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

  function applySettings(stored) {
    const defaults = Vimov.DEFAULT_SETTINGS;
    const settings = { ...defaults, ...stored };
    settings.hintChars = Vimov.normalizeHintChars(settings.hintChars) || defaults.hintChars;
    settings.scrollStep = Math.max(1, Number(settings.scrollStep) || defaults.scrollStep);
    state.settings = settings;
    state.keymap = keys.buildKeymap(settings.keymap);
    state.exclusions = keys.parseExclusions(settings.exclusions).rules;
    state.exclusionUrl = null;
  }

  function loadSettings() {
    browser.storage.sync.get(Vimov.DEFAULT_SETTINGS).then(applySettings, () => applySettings({}));
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

  function showPending() {
    if (!mode.current) ui.setStatus(count + pending.join(''));
  }

  function resetPending() {
    if (!pending.length && !count) return;
    pending = [];
    count = '';
    showPending();
  }

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

  function run({ command, options }, n, event) {
    try {
      const result = Vimov.actions[command](n, options, event);
      result?.catch?.((err) => ui.message(`${command}: ${err.message}`));
    } catch (err) {
      console.error('Vimov:', err);
      ui.message(`${command}: ${err.message}`);
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
    if (area === 'sync') loadSettings();
  });
  // The vbar, asked for from an iframe in this tab.
  browser.runtime.onMessage.addListener((message) => {
    if (message?.cmd === 'openSearch' && window.top === window) Vimov.search.open(message);
  });
})();
