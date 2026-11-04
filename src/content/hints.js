'use strict';

// Link hints: label every clickable element in view, then act on the one whose
// label the user types.

Vimov.hints = (() => {
  const { dom, ui } = Vimov;

  const ROLES = [
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'treeitem', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton',
  ];
  const CLICKABLE = [
    'a[href]', 'area[href]', 'button', 'select', 'textarea', 'summary', 'input:not([type="hidden"])',
    '[onclick]', '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex^="-"])',
    '[jsaction*="click"]', ...ROLES.map((role) => `[role="${role}"]`),
  ].join(',');

  function isClickable(el) {
    if (el.matches(CLICKABLE)) return !el.matches(':disabled');
    // A label stands in for a control that's hidden, as with custom-styled
    // checkboxes and file inputs.
    if (el.localName === 'label') {
      const control = el.control;
      return !!control && !control.disabled && !dom.visibleRect(control);
    }
    return false;
  }

  // Elements wired up with JavaScript listeners carry no attribute that says
  // so, but they usually show a pointer cursor. Only the outermost element of
  // a pointer region counts, and not if it holds or sits inside a real control.
  function looksClickable(el) {
    if (el === document.body || el === document.documentElement) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) {
      return false;
    }
    if (getComputedStyle(el).cursor !== 'pointer') return false;
    const parent = dom.flatParent(el);
    if (parent?.nodeType === 1 && getComputedStyle(parent).cursor === 'pointer') return false;
    // Inside a label, either the label or its control already has a hint.
    if (el.closest('label')?.control) return false;
    return !el.closest(CLICKABLE) && !el.querySelector(CLICKABLE);
  }

  // Clickable elements in view, in document order, with their visible boxes.
  function collect() {
    const targets = [];
    const visit = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (isClickable(el) || looksClickable(el)) {
          const rect = dom.visibleRect(el);
          if (rect) targets.push({ el, rect });
        }
        const shadow = dom.shadowRootOf(el);
        if (shadow) visit(shadow);
      }
    };
    visit(document);
    return targets;
  }

  // n labels in which none is a prefix of another, so typing one is never
  // ambiguous. Earlier elements get the shorter labels.
  function makeLabels(n, chars) {
    const labels = [''];
    let used = 0;
    while (labels.length - used < n || labels.length === 1) {
      const prefix = labels[used++];
      for (const c of chars) labels.push(prefix + c);
    }
    return labels.slice(used, used + n);
  }

  // Moves each marker right, past any earlier one it would cover, so every
  // label can be read: a tiny vote arrow and the title next to it, or a link
  // and a button inside it at the same corner. Earlier elements keep their
  // spot. All boxes are measured before any marker moves.
  function spreadOut(markers) {
    const boxes = markers.map(({ node }) => {
      const r = node.getBoundingClientRect();
      return { node, left: r.left, top: r.top, width: r.width, height: r.height, moved: false };
    });
    const overlaps = (a, b) =>
      a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
    const placed = [];
    for (const box of boxes) {
      for (let again = true; again; ) {
        again = false;
        for (const other of placed) {
          if (!overlaps(box, other)) continue;
          box.left = other.left + other.width + 1;
          box.moved = again = true;
        }
      }
      placed.push(box);
    }
    for (const box of boxes) if (box.moved) box.node.style.left = `${box.left}px`;
  }

  function activate({ el, rect }, action) {
    ui.flash(rect);
    Vimov.scroll.setTarget(el);
    const url = dom.linkUrl(el);
    switch (action) {
      case 'newTab':
      case 'newTabFg':
        if (url && /^https?:/.test(url)) Vimov.bg('openUrl', { url, active: action === 'newTabFg' });
        else dom.click(el);
        break;
      case 'copyUrl': {
        const target = url || el.currentSrc || el.src;
        if (target) Vimov.copyText(target);
        else ui.message('Nothing to copy: that isn’t a link');
        break;
      }
      case 'hover':
        dom.hover(el);
        break;
      case 'focus':
        el.focus();
        break;
      default:
        if (dom.isEditable(el)) {
          el.focus();
          if (el.localName === 'select') {
            try {
              el.showPicker();
            } catch {
              // Not every select can show a picker; focus is enough.
            }
          }
        } else {
          dom.click(el);
        }
    }
  }

  function start(action = 'click') {
    const targets = collect();
    if (!targets.length) {
      ui.message('No clickable elements in view');
      return;
    }
    const chars = Vimov.state.settings.hintChars;
    const labels = makeLabels(targets.length, chars);
    const layer = document.createElement('div');
    const markers = targets.map((target, i) => {
      const node = document.createElement('div');
      node.className = 'hint';
      node.style.left = `${target.rect.left}px`;
      node.style.top = `${target.rect.top}px`;
      node.textContent = labels[i];
      layer.append(node);
      return { ...target, label: labels[i], node };
    });
    ui.root().append(layer);
    spreadOut(markers);

    let typed = '';

    // Shows the markers that start with what's been typed; returns them.
    function filter() {
      const matching = [];
      for (const marker of markers) {
        const match = marker.label.startsWith(typed);
        marker.node.hidden = !match;
        if (!match) continue;
        matching.push(marker);
        const done = document.createElement('span');
        done.className = 'typed';
        done.textContent = typed;
        marker.node.replaceChildren(done, marker.label.slice(typed.length));
      }
      return matching;
    }

    const exitOnMouse = () => Vimov.mode.exit(mode);
    const mode = {
      name: 'hints',
      status: action === 'click' ? '' : Vimov.describeCommand('linkHints', { action }),
      onKey(key, event) {
        // Let browser shortcuts through.
        if (event.ctrlKey || event.metaKey) return false;
        const char = key.toLowerCase();
        if (key === '<esc>') {
          Vimov.mode.exit(mode);
        } else if (key === '<backspace>') {
          typed = typed.slice(0, -1);
          filter();
        } else if ([...key].length === 1 && chars.includes(char)) {
          typed += char;
          const matching = filter();
          if (!matching.length) {
            // Not a valid next character; ignore it.
            typed = typed.slice(0, -1);
            filter();
          } else if (matching.length === 1 && matching[0].label === typed) {
            Vimov.mode.exit(mode);
            activate(matching[0], action);
          }
        }
        return true;
      },
      onExit() {
        layer.remove();
        removeEventListener('mousedown', exitOnMouse, true);
      },
    };
    addEventListener('mousedown', exitOnMouse, true);
    Vimov.mode.enter(mode);
  }

  return { start, makeLabels };
})();
