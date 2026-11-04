'use strict';

// Scrolling. Many pages scroll an inner element rather than the document, so
// the target is the nearest scrollable ancestor of whatever the user last
// clicked, has focused, or sees in the middle of the viewport.

Vimov.scroll = (() => {
  const { dom } = Vimov;
  const AXES = {
    y: { pos: 'scrollTop', size: 'scrollHeight', view: 'clientHeight', overflow: 'overflowY', edge: 'top' },
    x: { pos: 'scrollLeft', size: 'scrollWidth', view: 'clientWidth', overflow: 'overflowX', edge: 'left' },
  };

  let lastClicked = null;
  // The largest scrollable element, for pages whose document doesn't scroll.
  let fallback = null;

  addEventListener('mousedown', (e) => {
    if (e.isTrusted) lastClicked = e.composedPath()[0];
  }, true);

  const docScroller = () => document.scrollingElement || document.documentElement;
  const isDocument = (el) => el === docScroller() || el === document.body || el === document.documentElement;
  const extent = (el, axis) => el[AXES[axis].size] - el[AXES[axis].view];

  function scrollable(el, axis) {
    if (extent(el, axis) < 1) return false;
    if (el === docScroller()) return true;
    return /^(auto|scroll|overlay)$/.test(getComputedStyle(el)[AXES[axis].overflow]);
  }

  function canMove(el, axis, dir) {
    const pos = el[AXES[axis].pos];
    return dir > 0 ? pos < extent(el, axis) - 1 : pos > 0;
  }

  function startElement() {
    if (lastClicked?.isConnected && lastClicked.nodeType === 1) return lastClicked;
    const active = dom.deepActiveElement();
    if (active && active !== document.body && active !== document.documentElement) return active;
    return dom.deepElementFromPoint(innerWidth / 2, innerHeight / 2);
  }

  function largestScrollable(axis) {
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll('*')) {
      const area = el.clientWidth * el.clientHeight;
      if (area > bestArea && scrollable(el, axis)) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  // An inner scroller that can still move in `dir` wins; once it's at its
  // end, scrolling passes to the document, as with a mouse wheel.
  function target(axis, dir) {
    for (let el = startElement(); el && !isDocument(el); el = dom.flatParent(el)) {
      if (scrollable(el, axis) && canMove(el, axis, dir)) return el;
    }
    const doc = docScroller();
    if (scrollable(doc, axis)) return doc;
    if (!(fallback?.isConnected && scrollable(fallback, axis))) fallback = largestScrollable(axis);
    return fallback || doc;
  }

  const behavior = (smooth) => (smooth ? 'smooth' : 'instant');

  // Scrolls by `px` pixels or by `pages` viewport heights (widths for x).
  function by(axis, { px, pages }, smooth) {
    const el = target(axis, Math.sign(px ?? pages));
    const view = el === docScroller() ? (axis === 'y' ? innerHeight : innerWidth) : el[AXES[axis].view];
    el.scrollBy({ [AXES[axis].edge]: px ?? pages * view, behavior: behavior(smooth) });
  }

  function to(axis, end, smooth) {
    const el = target(axis, end ? 1 : -1);
    el.scrollTo({ [AXES[axis].edge]: end ? el[AXES[axis].size] : 0, behavior: behavior(smooth) });
  }

  // Gliding: while a scroll key is held, scroll at a steady speed instead of
  // jumping on each key repeat. It stops when that key comes up or the page
  // loses focus. This keyup listener is added before main.js's, which hides
  // keyups from listeners after it.
  let glide = null; // { code, frame }

  function stopGlide() {
    if (!glide) return;
    cancelAnimationFrame(glide.frame);
    glide = null;
  }
  addEventListener('keyup', (e) => {
    if (glide?.code === e.code) stopGlide();
  }, true);
  addEventListener('blur', stopGlide);

  // Scrolls at `speed` pixels a second in `dir` until the key with this
  // event.code is released. Repeats of the same key leave the glide going.
  function startGlide(axis, dir, speed, code) {
    if (glide?.code === code) return;
    stopGlide();
    const el = target(axis, dir);
    let last = null;
    let carry = 0; // distance owed, kept until it adds up to a whole pixel
    const tick = (now) => {
      const ms = last === null ? 16 : Math.min(now - last, 50);
      last = now;
      carry += (dir * speed * ms) / 1000;
      const px = Math.trunc(carry);
      if (px) {
        el.scrollBy({ [AXES[axis].edge]: px, behavior: 'instant' });
        carry -= px;
      }
      glide.frame = requestAnimationFrame(tick);
    };
    glide = { code, frame: requestAnimationFrame(tick) };
  }

  // Makes later scrolling start from el, as if the user had clicked it.
  function setTarget(el) {
    lastClicked = el;
  }

  return { by, to, glide: startGlide, stopGlide, setTarget };
})();
