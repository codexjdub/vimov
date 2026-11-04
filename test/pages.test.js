'use strict';

// src/content/pages.js: which link ]] and [[ follow.

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
