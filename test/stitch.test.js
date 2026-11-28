'use strict';

// src/stitch.js: joining a screenshot's screens into images, with stand-in
// canvases that note what's drawn on them.

const test = require('node:test');
const assert = require('node:assert');
const { load, plain } = require('./helpers');

function stitcher(options) {
  const canvases = [];
  const encoded = [];
  const { Vimov } = load(['src/stitch.js'], { Vimov: {} });
  const made = new Vimov.Stitcher({
    canvas: (width, height) => {
      const canvas = { width, height, drawn: [], getContext: () => ({ drawImage: (...args) => canvas.drawn.push(args) }) };
      canvases.push(canvas);
      return canvas;
    },
    encode: async (canvas) => {
      encoded.push(canvas);
      return `png ${canvas.width}×${canvas.height}`;
    },
    ...options,
  });
  return { made, canvases, encoded };
}

// A screen as captured, `width` image pixels across.
const screen = (width) => ({ width, name: `screen ${width}` });
// Where each drawImage put its rows: [source y, rows, destination y].
const rows = (canvas) => canvas.drawn.map(([, , sy, , sh, , dy]) => [sy, sh, dy]);

test('screens go one under another, at the screen’s density, and the last only adds what’s new', async () => {
  const { made, canvases } = stitcher({ width: 100, height: 250 });
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  // Captured at twice the CSS pixels, as on a high-density screen.
  made.draw(screen(240), { top: 0, rect, viewport: 120 });
  made.draw(screen(240), { top: 100, rect, viewport: 120 });
  // The page stops scrolling 50 px short, so the last screen starts at 150.
  made.draw(screen(240), { top: 150, rect, viewport: 120 });
  assert.strictEqual(canvases.length, 1);
  assert.deepStrictEqual([canvases[0].width, canvases[0].height], [200, 500]);
  assert.deepStrictEqual(rows(canvases[0]), [[0, 200, 0], [0, 200, 200], [100, 100, 400]]);
  assert.deepStrictEqual(plain(await made.finish()), ['png 200×500']);
});

test('a scroller inside the page keeps only its own part of each screen', () => {
  const { made, canvases } = stitcher({ width: 80, height: 300 });
  made.draw(screen(100), { top: 0, rect: { left: 10, top: 50, width: 80, height: 100 }, viewport: 100 });
  const [image, sx, sy, sw, sh, dx, dy, dw, dh] = canvases[0].drawn[0];
  assert.strictEqual(image.name, 'screen 100');
  assert.deepStrictEqual([sx, sy, sw, sh, dx, dy, dw, dh], [10, 50, 80, 100, 0, 0, 80, 100]);
});

test('a page too long for one image is split evenly, and each part is saved as soon as it’s done', async () => {
  // At most 400 rows an image: 1000 rows make 3, of 334, 334 and 332.
  const { made, canvases, encoded } = stitcher({ width: 100, height: 1000, maxArea: 40000 });
  const rect = { left: 0, top: 0, width: 100, height: 300 };
  made.draw(screen(100), { top: 0, rect, viewport: 100 });
  made.draw(screen(100), { top: 300, rect, viewport: 100 });
  // The second screen ran over into the second image.
  assert.deepStrictEqual(canvases.map((c) => c.height), [334, 334]);
  assert.deepStrictEqual(rows(canvases[0]), [[0, 300, 0], [0, 34, 300]]);
  assert.deepStrictEqual(rows(canvases[1]), [[34, 266, 0]]);
  assert.deepStrictEqual(encoded, [canvases[0]]);
  made.draw(screen(100), { top: 600, rect, viewport: 100 });
  made.draw(screen(100), { top: 700, rect, viewport: 100 });
  assert.deepStrictEqual(plain(await made.finish()), ['png 100×334', 'png 100×334', 'png 100×332']);
});

test('a page that stopped short of the height planned ends where it stopped', async () => {
  const { made, canvases } = stitcher({ width: 100, height: 500 });
  made.draw(screen(100), { top: 0, rect: { left: 0, top: 0, width: 100, height: 320 }, viewport: 100 });
  assert.deepStrictEqual(plain(await made.finish()), ['png 100×320']);
  assert.strictEqual(canvases[1].drawn[0][0], canvases[0]); // copied over, cut to size
});
