'use strict';

// src/content/pages.js: which link } and { follow.

const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./helpers');

const { Vimov } = load(['src/content/pages.js'], { Vimov: {} });
const link = (label, rel = '') => ({ label, rel: rel.split(' ') });
const pick = (links, dir) => Vimov.pages.choose(links, dir);

test('rel="next" and rel="prev" win over the text', () => {
  const links = [link('Next'), link('2', 'next'), link('Prev'), link('Back', 'nofollow prev')];
  assert.strictEqual(pick(links, 'next'), 1);
  assert.strictEqual(pick(links, 'previous'), 3);
  assert.strictEqual(pick([link('Earlier', 'previous')], 'previous'), 0);
});

test('a word at the start beats an arrow, and an arrow alone beats one at the end', () => {
  const links = [link('Page 2 »'), link('›'), link('Next page')];
  assert.strictEqual(pick(links, 'next'), 2);
  assert.strictEqual(pick(links.slice(0, 2), 'next'), 1);
  assert.strictEqual(pick([link('« Older posts'), link('Newer posts »')], 'previous'), 0);
  assert.strictEqual(pick([link('« Older posts'), link('Newer posts »')], 'next'), 1);
});

test('headlines and "read more" links aren\'t pages', () => {
  const links = [
    link('What’s next for the web'),
    link('Next-generation browsers and what they mean for you'),
    link('Read more'),
    link('Previously on the blog'),
  ];
  assert.strictEqual(pick(links, 'next'), -1);
  assert.strictEqual(pick(links, 'previous'), -1);
  assert.strictEqual(pick([...links, link('More')], 'next'), 4);
});

test('a single arrow beats a double one, which goes to the first or last page', () => {
  const labels = (...texts) => texts.map((t) => link(t));
  const arrows = labels('«', '‹', '1', '2', '3', '›', '»');
  assert.strictEqual(pick(arrows, 'previous'), 1);
  assert.strictEqual(pick(arrows, 'next'), 5);
  assert.strictEqual(pick(labels('« First', '‹ Prev', '1', '2', 'Next ›', 'Last »'), 'previous'), 1);
  const ascii = labels('<< First', '< Back', '1', '2', 'Onward >', 'Last >>');
  assert.strictEqual(pick(ascii, 'previous'), 1);
  assert.strictEqual(pick(ascii, 'next'), 4);
  // A double arrow still counts when there's no single one.
  assert.strictEqual(pick(labels('«', '1', '2', '»'), 'previous'), 0);
  assert.strictEqual(pick(labels('«', '1', '2', '»'), 'next'), 3);
});

test('the word has to end: Next.js and Next-gen aren\'t the next page', () => {
  assert.strictEqual(pick([link('Next.js'), link('Next-gen phones'), link('Nextcloud'), link('Next')], 'next'), 3);
  assert.strictEqual(pick([link('Next: Chapter 3')], 'next'), 0);
  assert.strictEqual(pick([link('Prev. page')], 'previous'), 0);
  assert.strictEqual(pick([link('Previews'), link('Older')], 'previous'), 1);
});

test('Chinese next and previous links, the page before the chapter', () => {
  const links = [link('首页'), link('上一章'), link('上一页'), link('下一页'), link('下一章'), link('尾页')];
  assert.strictEqual(pick(links, 'next'), 3);
  assert.strictEqual(pick(links, 'previous'), 2);
  assert.strictEqual(pick([link('上一章'), link('下一章')], 'next'), 1);
  assert.strictEqual(pick([link('下一頁'), link('上一頁')], 'previous'), 1);
  assert.strictEqual(pick([link('后一页')], 'next'), 0);
  assert.strictEqual(pick([link('上一篇：标题')], 'previous'), 0);
  assert.strictEqual(pick([link('下一話')], 'next'), 0);
  assert.strictEqual(pick([link('下载'), link('首页'), link('上传'), link('阅览下一章节')], 'next'), -1);
});
