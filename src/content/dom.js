'use strict';

// DOM helpers shared by the content-script modules.

Vimov.dom = (() => {
  const TEXT_TYPES = new Set([
    'text', 'search', 'email', 'url', 'tel', 'password', 'number',
    'date', 'datetime-local', 'month', 'time', 'week',
  ]);

  // Firefox lets extensions see into closed shadow roots as well as open ones.
  const shadowRootOf = (el) => el.openOrClosedShadowRoot ?? el.shadowRoot ?? null;

  // Parent in the flattened tree: slotted nodes belong to their slot, and a
  // shadow root's children to its host.
  const flatParent = (node) => node.assignedSlot ?? node.parentElement ?? node.parentNode?.host ?? null;

  function composedContains(ancestor, node) {
    for (; node; node = flatParent(node)) if (node === ancestor) return true;
    return false;
  }

  function deepActiveElement() {
    let el = document.activeElement;
    for (let root = el && shadowRootOf(el); root?.activeElement; root = shadowRootOf(el)) {
      el = root.activeElement;
    }
    return el;
  }

  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    for (let root = el && shadowRootOf(el); root; root = shadowRootOf(el)) {
      const inner = root.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function isTextEntry(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el.localName === 'textarea') return !el.disabled;
    if (el.localName === 'input') return TEXT_TYPES.has(el.type) && !el.disabled;
    return false;
  }

  // Whether a focused element needs the keyboard for itself. Selects count
  // because typing a letter picks an option.
  const isEditable = (el) =>
    isTextEntry(el) || ['select', 'embed', 'object'].includes(el?.localName);

  // Whether something at (x, y) is el, inside el, or a label for el.
  function hitsElement(el, x, y) {
    const hit = deepElementFromPoint(x, y);
    return !!hit && (composedContains(el, hit) || hit.closest?.('label')?.control === el);
  }

  // The part of el's box that is in the viewport and not covered by anything
  // else, or null. Links whose own box is empty (an inline <a> around a block)
  // are measured by their children.
  function visibleRect(el, probe = el) {
    for (const r of probe.getClientRects()) {
      const left = Math.max(r.left, 0);
      const top = Math.max(r.top, 0);
      const right = Math.min(r.right, innerWidth);
      const bottom = Math.min(r.bottom, innerHeight);
      if (right - left < 3 || bottom - top < 3) continue;
      const points = [
        [(left + right) / 2, (top + bottom) / 2],
        [left + 2, top + 2],
        [right - 2, top + 2],
        [left + 2, bottom - 2],
        [right - 2, bottom - 2],
      ];
      if (points.some(([x, y]) => hitsElement(el, x, y))) return { left, top, right, bottom };
    }
    if (probe === el) {
      for (const child of el.children) {
        const rect = visibleRect(el, child);
        if (rect) return rect;
      }
    }
    return null;
  }

  // Visible text fields, contenteditable roots included, in document order.
  function textEntries() {
    return [...document.querySelectorAll('input, textarea, [contenteditable]')].filter(
      (el) => isTextEntry(el) && !el.readOnly && !el.parentElement?.isContentEditable && visibleRect(el),
    );
  }

  // The URL a link points to, or null if el isn't in a link with a real URL.
  function linkUrl(el) {
    const a = el.closest?.('a[href], area[href]');
    if (!a) return null;
    try {
      const url = new URL(a.getAttribute('href'), document.baseURI);
      return /^(https?|ftp|file):$/.test(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function mouseInit(el, extra = {}) {
    const r = el.getBoundingClientRect();
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      button: 0,
      detail: 1,
      ...extra,
    };
  }

  // Simulates the event sequence of a real left click, for pages that listen
  // for mousedown or pointerup rather than click.
  function click(el) {
    const init = mouseInit(el);
    const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerover', pointer));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    const proceed = el.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }));
    if (proceed && el.tabIndex >= 0 && el.localName !== 'a') el.focus({ preventScroll: true });
    el.dispatchEvent(new PointerEvent('pointerup', pointer));
    el.dispatchEvent(new MouseEvent('mouseup', init));
    el.dispatchEvent(new MouseEvent('click', init));
  }

  function hover(el) {
    const init = mouseInit(el);
    const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerover', pointer));
    el.dispatchEvent(new PointerEvent('pointerenter', { ...pointer, bubbles: false }));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
    el.dispatchEvent(new PointerEvent('pointermove', pointer));
    el.dispatchEvent(new MouseEvent('mousemove', init));
  }

  return {
    shadowRootOf,
    flatParent,
    deepActiveElement,
    deepElementFromPoint,
    isTextEntry,
    isEditable,
    visibleRect,
    textEntries,
    linkUrl,
    click,
    hover,
  };
})();
