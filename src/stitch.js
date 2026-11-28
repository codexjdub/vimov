'use strict';

// Joins the screens of a screenshot (src/content/screenshot.js) into images,
// top to bottom: one, or a few of even height where one would be larger
// than Firefox lets an image be. Each image becomes a PNG as soon as its
// last row is drawn, so only one or two are held whole at a time.

Vimov.Stitcher = class {
  // `width` × `height`: the area to capture, in CSS pixels, `height` from
  // the top of the page. `canvas(w, h)` makes an image and `encode(canvas)`
  // turns it into a file; tests pass their own.
  constructor({ width, height, maxSide = 32767, maxArea = 64e6, canvas, encode }) {
    Object.assign(this, { width, height, maxSide, maxArea });
    this.canvas = canvas || ((w, h) => new OffscreenCanvas(w, h));
    this.encode = encode || ((c) => c.convertToBlob({ type: 'image/png' }));
    this.drawn = 0; // how far down the page is drawn, in CSS pixels
    this.parts = null; // [{ top, height, canvas, blob }], in image pixels, once the first screen comes
    this.saving = [];
  }

  // Splits the page into images, at `scale` image pixels to a CSS pixel.
  plan(scale) {
    this.scale = scale;
    this.imageWidth = Math.max(1, Math.round(this.width * scale));
    const total = Math.max(1, Math.round(this.height * scale));
    const most = Math.max(1, Math.min(this.maxSide, Math.floor(this.maxArea / this.imageWidth)));
    const each = Math.ceil(total / Math.ceil(total / most));
    this.parts = [];
    for (let top = 0; top < total; top += each) this.parts.push({ top, height: Math.min(each, total - top) });
  }

  context(part) {
    if (!part.canvas) {
      part.canvas = this.canvas(this.imageWidth, part.height);
      part.ctx = part.canvas.getContext('2d');
      if (!part.ctx) throw new Error('The screenshot is too big to put together');
    }
    return part.ctx;
  }

  save(part) {
    if (part.saving) return;
    part.saving = Promise.resolve(this.encode(part.canvas)).then((blob) => {
      part.blob = blob;
      part.canvas = part.ctx = null;
    });
    this.saving.push(part.saving);
  }

  // Draws what's new in a screen: `image` as captured, `viewport` CSS
  // pixels wide; `rect` the part of it to keep, in CSS pixels; `top` where
  // that part starts on the page. What's already drawn stays, so the first
  // screen's top bar isn't drawn over.
  draw(image, { top, rect, viewport }) {
    const scale = image.width / viewport;
    if (!this.parts) this.plan(scale);
    const from = Math.max(top, this.drawn);
    const to = Math.min(top + rect.height, this.height);
    if (to <= from) return;
    this.drawn = to;
    const k = scale / this.scale; // image pixels on this screen to one in the result
    const pageFrom = Math.round(from * this.scale);
    const pageTo = Math.round(to * this.scale);
    const screenFrom = (rect.top + from - top) * scale;
    const sx = rect.left * scale;
    const sw = rect.width * scale;
    for (const part of this.parts) {
      const a = Math.max(pageFrom, part.top);
      const b = Math.min(pageTo, part.top + part.height);
      if (b <= a) continue;
      this.context(part).drawImage(image, sx, screenFrom + (a - pageFrom) * k, sw, (b - a) * k,
        0, a - part.top, this.imageWidth, b - a);
      if (b === part.top + part.height) this.save(part);
    }
  }

  // The PNGs, top to bottom. A page that stopped short of the height
  // planned ends where it stopped.
  async finish() {
    if (!this.parts) return [];
    const end = Math.round(this.drawn * this.scale);
    for (const part of this.parts) {
      if (part.saving || !part.canvas) continue;
      if (part.top + part.height > end) {
        const cut = this.canvas(this.imageWidth, end - part.top);
        cut.getContext('2d').drawImage(part.canvas, 0, 0);
        part.canvas = cut;
        part.height = end - part.top;
      }
      this.save(part);
    }
    await Promise.all(this.saving);
    return this.parts.filter((part) => part.blob).map((part) => part.blob);
  }
};
