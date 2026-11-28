'use strict';

// The tab a screenshot opens in (src/content/screenshot.js): the image, or
// its parts when it was too long for one, each to copy or save as a PNG.
// Ctrl+C (⌘C) copies it and Ctrl+S (⌘S) saves it, when there's one.

(async () => {
  const $ = (id) => document.getElementById(id);
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const mac = /Mac/.test(navigator.platform);
  const shortcut = (key) => (mac ? `⌘${key}` : `Ctrl+${key}`);
  const pad = (n) => String(n).padStart(2, '0');

  // Named as Firefox names its own screenshots, with the part when there
  // are several: "Screenshot 2026-11-28 at 14.03.22 Page title.png".
  function fileName(title, when, i, count) {
    const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
    const time = `${pad(when.getHours())}.${pad(when.getMinutes())}.${pad(when.getSeconds())}`;
    const name = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return `Screenshot ${date} at ${time}${name ? ` ${name}` : ''}${count > 1 ? ` (${i + 1} of ${count})` : ''}.png`;
  }

  const megabytes = (bytes) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

  // The button says what happened, for a moment.
  function say(button, text) {
    button.textContent = text;
    clearTimeout(button.timer);
    button.timer = setTimeout(() => (button.textContent = button.dataset.text), 1500);
  }

  async function copy(blob, button) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say(button, 'Copied');
    } catch (err) {
      console.error('Vimov:', err);
      say(button, 'Couldn’t copy');
    }
  }

  let shot = null;
  try {
    shot = (await browser.runtime.sendMessage({ cmd: 'shotResult', id: location.hash.slice(1) }))?.result;
  } catch (err) {
    console.error('Vimov:', err);
  }
  if (!shot?.parts?.length) {
    document.title = 'Screenshot gone';
    $('title').textContent = 'This screenshot is gone';
    $('source').textContent = 'A screenshot is kept only while its tab is open. Take it again with :screenshot on the page.';
    return;
  }

  const when = new Date(shot.when);
  let host = '';
  try {
    host = new URL(shot.url).host;
  } catch {}
  const title = shot.title || host || 'Screenshot';
  document.title = `Screenshot: ${title}`;
  $('title').textContent = title;
  const link = el('a', '', shot.url);
  link.href = shot.url;
  const time = when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  $('source').append(link, ` · ${time} · From the top of the page down to as far as you’d scrolled`);

  const count = shot.parts.length;
  const actions = shot.parts.map((blob, i) => {
    const url = URL.createObjectURL(blob);
    const part = el('figure', 'part');
    const head = el('div', 'head');
    if (count > 1) head.append(el('span', 'count', `Part ${i + 1} of ${count}`));
    const copyButton = el('button', 'primary', 'Copy');
    copyButton.dataset.text = 'Copy';
    copyButton.type = 'button';
    const save = el('a', 'button', 'Save');
    save.href = url;
    save.download = fileName(title, when, i, count);
    if (count === 1) {
      copyButton.title = `Copy the image (${shortcut('C')})`;
      save.title = `Save it as a PNG (${shortcut('S')})`;
    }
    copyButton.addEventListener('click', () => copy(blob, copyButton));
    const size = el('span', 'size', megabytes(blob.size));
    head.append(copyButton, save, size);

    const img = el('img');
    img.alt = count > 1 ? `Part ${i + 1} of ${count} of the screenshot` : 'The screenshot';
    // Shown at the size the page was, not doubled on a high-density screen.
    img.addEventListener('load', () => {
      img.style.width = `${img.naturalWidth / devicePixelRatio}px`;
      size.textContent = `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px · ${megabytes(blob.size)}`;
    }, { once: true });
    img.src = url;
    part.append(head, img);
    $('parts').append(part);
    return { copy: () => copy(blob, copyButton), save: () => save.click() };
  });

  addEventListener('keydown', (e) => {
    if (count !== 1 || !(mac ? e.metaKey : e.ctrlKey) || e.shiftKey || e.altKey) return;
    if (e.key === 'c' && !getSelection().toString()) actions[0].copy();
    else if (e.key === 's') actions[0].save();
    else return;
    e.preventDefault();
  });
})();
