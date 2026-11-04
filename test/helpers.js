'use strict';

// Loads Vimov's plain scripts into fresh vm contexts with stand-in browser
// APIs, the way the browser loads them: one shared global scope per context.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const SHARED = ['src/shared/commands.js', 'src/shared/defaults.js', 'src/shared/keys.js'];

// Runs more files in an existing context, after the ones already there.
function run(ctx, files) {
  for (const file of files) vm.runInContext(read(file), ctx, { filename: file });
  return ctx;
}

// Runs `files` in a new context. Web globals the scripts use (URL, timers)
// aren't part of a bare vm context, so they're passed in with `globals`.
function load(files, globals = {}) {
  const ctx = vm.createContext({ console, URL, setTimeout, clearTimeout, ...globals });
  ctx.globalThis = ctx;
  return run(ctx, files);
}

// The value of a top-level `const` in a context, such as Sources.
const get = (ctx, name) => vm.runInContext(name, ctx);

// Objects made inside a context have that context's prototypes, which
// deepStrictEqual counts as different; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

// An event with addListener that keeps its listeners, to fire them by hand.
function event() {
  const listeners = [];
  return {
    listeners,
    addListener: (fn) => listeners.push(fn),
    fire: (...args) => Promise.all(listeners.map((fn) => fn(...args))),
  };
}

module.exports = { SHARED, load, run, get, plain, event };
