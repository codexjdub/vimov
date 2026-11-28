'use strict';

// :screenshot: the page from the top down to as far as it's been scrolled,
// as one tall image or a few. Vimov scrolls back to the top and down again a
// screen at a time, and the background page takes a picture of each screen
// as it shows (src/stitch.js joins them). Feeds that keep only the posts
// near the screen, as X does, come out whole this way, where Firefox's own
// "Save full page" draws them blank. Runs in the top frame.

Vimov.screenshot = (() => {
  const { ui } = Vimov;
  const SETTLE_MS = 120; // after each scroll, for the page to draw what came into view
  const IMAGES_MS = 1500; // and at most this long for pictures still loading there
  const STOPPED = 'Screenshot stopped';

  // How far down each scroller has been seen on this page: its scroll
  // offset plus its height, at the furthest. So a screenshot reaches as far
  // as you've been, even after you've come back up. Single-page apps change
  // the address without reloading; a new address starts afresh.
  let seenAt = location.href;
  let seen = new Map(); // scroller → the furthest its bottom edge has been
  let job = null; // the screenshot being taken: { stop(why) }

  const docScroller = () => Vimov.scroll.docScroller();
  const scrollsDown = (el) => el.scrollHeight - el.clientHeight > 1;

  function forget() {
    if (location.href === seenAt) return;
    seenAt = location.href;
    seen = new Map();
  }

  function onScroll(e) {
    if (job) return;
    const el = e.target === document ? docScroller() : e.target;
    if (el?.nodeType !== 1 || ui.owns(el) || !scrollsDown(el)) return;
    forget();
    const bottom = el.scrollTop + el.clientHeight;
    if (bottom > (seen.get(el) || 0)) seen.set(el, bottom);
  }
  if (window.top === window) addEventListener('scroll', onScroll, { capture: true, passive: true });

  // What to capture: of the scrollers that have moved, the largest on
  // screen (the page's main column, not a menu scrolled on the way); or
  // else what the scroll keys would move.
  function scroller() {
    forget();
    let best = null;
    let bestArea = 0;
    for (const el of seen.keys()) {
      const area = el.clientWidth * el.clientHeight;
      if (el.isConnected && scrollsDown(el) && area > bestArea) [best, bestArea] = [el, area];
    }
    return best || Vimov.scroll.target('y', 1) || docScroller();
  }

  // The part of the screen a scroller shows, in CSS pixels from the
  // viewport's top left: all of it for the page, an element's inside for
  // an element.
  function viewOf(el) {
    if (el === docScroller()) return { left: 0, top: 0, width: el.clientWidth, height: el.clientHeight };
    const box = el.getBoundingClientRect();
    const left = Math.max(box.left + el.clientLeft, 0);
    const top = Math.max(box.top + el.clientTop, 0);
    return {
      left,
      top,
      width: Math.min(box.left + el.clientLeft + el.clientWidth, innerWidth) - left,
      height: Math.min(box.top + el.clientTop + el.clientHeight, innerHeight) - top,
    };
  }

  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Whether a picture in `view` is still loading.
  function loading(view) {
    for (const img of document.images) {
      if (img.complete) continue;
      const r = img.getBoundingClientRect();
      const inView = r.width && r.height && r.bottom > view.top && r.top < view.top + view.height &&
        r.right > view.left && r.left < view.left + view.width;
      if (inView) return true;
    }
    return false;
  }

  // Waits for the page to draw what scrolled into view, and for pictures
  // there to load, for a moment at most.
  async function settle(view) {
    await frame();
    await sleep(SETTLE_MS);
    const until = performance.now() + IMAGES_MS;
    while (loading(view) && performance.now() < until) await sleep(100);
    await frame();
  }

  // Parts that stay put while the page scrolls (a top bar, a side menu)
  // show on the first screen only; on every screen after, they'd repeat.
  // Not one the scroller is inside, which would take it along. `hidden`
  // keeps what each one had, to put back.
  function hideFixed(el, hidden) {
    for (const node of document.querySelectorAll('body *')) {
      if (hidden.has(node) || ui.owns(node) || node.contains(el)) continue;
      const { position } = getComputedStyle(node);
      if (position !== 'fixed' && position !== 'sticky') continue;
      hidden.set(node, [node.style.getPropertyValue('visibility'), node.style.getPropertyPriority('visibility')]);
      node.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  function unhide(hidden) {
    for (const [node, [value, priority]] of hidden) {
      if (value) node.style.setProperty('visibility', value, priority);
      else node.style.removeProperty('visibility');
    }
  }

  // Resolves to the error to show, or '' when it went through.
  async function send(cmd, args = {}) {
    try {
      return (await browser.runtime.sendMessage({ cmd, ...args }))?.error || '';
    } catch (err) {
      console.error('Vimov:', err);
      return 'Couldn’t take the screenshot. Reloading the page may help.';
    }
  }

  async function start() {
    if (job) return;
    const el = scroller();
    const view = viewOf(el);
    if (!(view.width >= 1 && view.height >= 1)) {
      ui.message('Nothing on screen to take a screenshot of');
      return;
    }
    const from = el.scrollTop;
    const end = Math.min(Math.max(seen.get(el) || 0, from + view.height), el.scrollHeight);

    let stopped = '';
    const stop = (why) => (stopped ||= why);
    job = { stop };
    // Esc stops it; so does taking over with the mouse, or leaving the tab.
    const mode = {
      name: 'screenshot',
      onKey(key) {
        if (key === '<esc>') stop(STOPPED);
        return true;
      },
    };
    const onMouse = () => stop(STOPPED);
    const onHidden = () => document.hidden && stop(STOPPED);
    Vimov.mode.enter(mode);
    addEventListener('wheel', onMouse, true);
    addEventListener('mousedown', onMouse, true);
    document.addEventListener('visibilitychange', onHidden);
    ui.setHidden(true);

    const hidden = new Map();
    let error = '';
    try {
      error = await send('shotStart', { width: view.width, height: end, title: document.title, url: location.href });
      for (let y = 0, i = 0; !error && !stopped; i++) {
        el.scrollTo({ top: y, behavior: 'instant' });
        await settle(view);
        if (stopped) break;
        if (i) {
          hideFixed(el, hidden);
          await frame();
        }
        const top = el.scrollTop;
        const progress = Math.min((top + view.height) / end, 1);
        error = await send('shotTake', { top, rect: view, viewport: innerWidth, progress });
        // Done at the end, or where the page stops scrolling short of it.
        if (top + view.height >= end - 1 || top < y - 1) break;
        y = top + view.height;
      }
    } catch (err) {
      console.error('Vimov:', err);
      error = 'Couldn’t take the screenshot';
    }

    // The page goes back to how it was, then the pictures are put together.
    removeEventListener('wheel', onMouse, true);
    removeEventListener('mousedown', onMouse, true);
    document.removeEventListener('visibilitychange', onHidden);
    unhide(hidden);
    el.scrollTo({ top: from, behavior: 'instant' });
    ui.setHidden(false);
    Vimov.mode.exit(mode);
    job = null;
    if (error || stopped) {
      send('shotCancel');
      ui.message(error || stopped);
      return;
    }
    ui.message('Putting the screenshot together…', 60000);
    error = await send('shotFinish');
    ui.message(error || 'The screenshot is in the next tab');
  }

  return { start };
})();
