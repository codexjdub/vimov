'use strict';

// store/: what the release workflow sends to addons.mozilla.org.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('the reviewer notes fit in the 3000 characters AMO accepts', () => {
  // The workflow sends them trimmed; AMO counts characters, not bytes.
  const notes = fs.readFileSync(path.join(__dirname, '..', 'store', 'reviewer-notes.txt'), 'utf8').trim();
  const length = [...notes].length;
  assert.ok(length <= 3000, `store/reviewer-notes.txt is ${length} characters; AMO accepts at most 3000`);
});
