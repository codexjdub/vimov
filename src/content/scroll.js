'use strict';

// Scrolling. Many pages scroll an inner element rather than the document, so
// the target is the nearest scrollable ancestor of whatever the user last
// clicked or moved focus to, or of what's in the middle of the viewport.

Vimov.scroll = (() => {
  const { dom } = Vimov;
  const AXES = {
    y: { pos: 'scrollTop', size: 'scrollHeight', view: 'clientHeight', overflow: 'overflowY', edge: 'top' },
    x: { pos: 'scrollLeft', size: 'scrollWidth', view: 'clientWidth', overflow: 'overflowX', edge: 'left' },
  };

  let lastTarget = null; // what was last clicked or focused
  // The largest scrollable element, for pages whose document doesn't scroll.
  let fallback = null;

  const remember = (e) => {
    const node = e.composedPath()[0];
    if (e.isTrusted && !Vimov.ui.owns(node)) lastTarget = node;
  };
  addEventListener('mousedown', remember, true);
  // Focus that moves later wins over the click: a modal that focuses itself
  // as it opens is what gets scrolled, not the button that opened it.
  // Vimov's own boxes taking focus don't count.
  addEventListener('focusin', remember, true);

  const docScroller = () => document.scrollingElement || document.documentElement;
  const isDocument = (el) => el === docScroller() || el === document.body || el === document.documentElement;
  const extent = (el, axis) => el[AXES[axis].size] - el[AXES[axis].view];

  // Whether the page has stopped the document scrolling with overflow:
  // hidden on the root, or on the body, which passes it to the page, as
  // pages do behind a modal. The mouse wheel doesn't scroll it then either.
  function locked(axis) {
    const prop = AXES[axis].overflow;
    const rootValue = getComputedStyle(document.documentElement)[prop];
    const value = rootValue === 'visible' && document.body ? getComputedStyle(document.body)[prop] : rootValue;
    return value === 'hidden' || value === 'clip';
  }

  function scrollable(el, axis) {
    if (extent(el, axis) < 1) return false;
    if (el === docScroller()) return !locked(axis);
    return /^(auto|scroll|overlay)$/.test(getComputedStyle(el)[AXES[axis].overflow]);
  }

  function canMove(el, axis, dir) {
    const pos = el[AXES[axis].pos];
    return dir > 0 ? pos < extent(el, axis) - 1 : pos > 0;
  }

  function startElement() {
    if (lastTarget?.isConnected && lastTarget.nodeType === 1) return lastTarget;
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
  // end, scrolling passes to the document, as with a mouse wheel. Null when
  // nothing on the page scrolls.
  function target(axis, dir) {
    for (let el = startElement(); el && !isDocument(el); el = dom.flatParent(el)) {
      if (scrollable(el, axis) && canMove(el, axis, dir)) return el;
    }
    const doc = docScroller();
    if (scrollable(doc, axis)) return doc;
    if (!(fallback?.isConnected && scrollable(fallback, axis))) fallback = largestScrollable(axis);
    return fallback;
  }

  const behavior = (smooth) => (smooth ? 'smooth' : 'instant');

  // How far el can scroll in `dir`, for the distance scrolled that the
  // options page shows (Vimov.tally).
  function room(el, axis, dir) {
    const pos = Math.abs(el[AXES[axis].pos]);
    return Math.max(dir > 0 ? extent(el, axis) - pos : pos, 0);
  }

  // Scrolls by `px` pixels or by `pages` viewport heights (widths for x).
  function by(axis, { px, pages }, smooth) {
    const el = target(axis, Math.sign(px ?? pages));
    if (!el) return;
    const view = el === docScroller() ? (axis === 'y' ? innerHeight : innerWidth) : el[AXES[axis].view];
    const distance = px ?? pages * view;
    Vimov.tally('px', Math.min(Math.abs(distance), room(el, axis, Math.sign(distance))));
    el.scrollBy({ [AXES[axis].edge]: distance, behavior: behavior(smooth) });
  }

  function to(axis, end, smooth) {
    const el = target(axis, end ? 1 : -1);
    if (!el) return;
    Vimov.tally('px', room(el, axis, end ? 1 : -1));
    el.scrollTo({ [AXES[axis].edge]: end ? el[AXES[axis].size] : 0, behavior: behavior(smooth) });
  }

  // Smooth line scrolling (j, k, h, l). A press eases one step along. Held,
  // the scroll carries straight on into a glide that builds up to speed,
  // with no pause while the system waits to repeat the key, and eases to a
  // stop when the key comes up. The scroll follows a goal like a spring
  // that doesn't overshoot (critically damped): a press moves the goal a
  // step, and holding moves it along at the glide's speed.
  const SPRING = 30; // how closely the scroll follows: most of a step in 150 ms
  const HOLD_MS = 80; // a press held longer than this starts to glide…
  const RAMP_MS = 250; // …and reaches full speed this much later
  // { el, axis, dir, speed, code, held, heldFor, x, v, goal, moved, last, frame }
  let motion = null;

  function stopMotion() {
    if (!motion) return;
    cancelAnimationFrame(motion.frame);
    motion = null;
  }

  // The key came up, or the page lost focus with it down: ease to a stop.
  // This keyup listener is added before main.js's, which hides keyups from
  // listeners after it.
  const release = () => motion && (motion.held = false);
  addEventListener('keyup', (e) => {
    if (motion?.code === e.code) release();
  }, true);
  addEventListener('blur', release);

  function tick(now) {
    const m = motion;
    const ms = m.last === null ? 1000 / 60 : Math.min(now - m.last, 50);
    m.last = now;
    const dt = ms / 1000;
    if (m.held) {
      m.heldFor += ms;
      const ramp = Math.min(Math.max((m.heldFor - HOLD_MS) / RAMP_MS, 0), 1);
      m.goal += m.dir * m.speed * ramp * dt;
    }
    // The spring, solved exactly for this frame, so a slow frame can't
    // throw it off.
    const off = m.x - m.goal;
    const k = m.v + SPRING * off;
    const decay = Math.exp(-SPRING * dt);
    m.x = m.goal + (off + k * dt) * decay;
    m.v = (m.v - SPRING * k * dt) * decay;
    const settled = !m.held && Math.abs(m.goal - m.x) < 0.5 && Math.abs(m.v) < 10;
    // Whole pixels at a time; the rest waits until it adds up.
    const px = settled ? Math.round(m.goal - m.moved) : Math.trunc(m.x - m.moved);
    if (px) {
      const { pos, edge } = AXES[m.axis];
      const before = m.el[pos];
      m.el.scrollBy({ [edge]: px, behavior: 'instant' });
      m.moved += px;
      Vimov.tally('px', Math.abs(m.el[pos] - before));
      // At the end of the page, what's still owed is dropped, so a press
      // the other way moves at once.
      if (m.el[pos] === before) {
        m.goal = m.x = m.moved;
        m.v = 0;
      }
    }
    if (settled) motion = null;
    else m.frame = requestAnimationFrame(tick);
  }

  // A press of a line scroll key: `distance` pixels in `dir` along `axis`,
  // gliding on at `speed` pixels a second while the key with event.code
  // `code` stays down. A key repeat (distance 0) leaves the glide going, or
  // starts one at once if there's none. A press the other way turns the
  // scroll around smoothly.
  function press(axis, dir, { distance = 0, speed = 0, code = null } = {}) {
    if (!distance && motion?.held && motion.code === code) return;
    const el = target(axis, dir);
    if (!el) return;
    if (motion && (motion.el !== el || motion.axis !== axis)) stopMotion();
    motion ||= { el, axis, x: 0, v: 0, goal: 0, moved: 0, last: null, frame: requestAnimationFrame(tick) };
    Object.assign(motion, { dir, speed, code, held: !!code, heldFor: distance ? 0 : HOLD_MS });
    motion.goal += dir * distance;
  }

  // Makes later scrolling start from el, as if the user had clicked it.
  function setTarget(el) {
    lastTarget = el;
  }

  return { by, to, press, setTarget };
})();
