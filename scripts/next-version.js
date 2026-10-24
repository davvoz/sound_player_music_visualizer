'use strict';

// Prints the version for the next release, or nothing if there is nothing to release.
// Based on the latest v* tag and the commits since it (Conventional Commits):
//   "feat!:" / "BREAKING CHANGE" -> major, "feat:" -> minor, anything else -> patch.
// package.json's version is a floor: raising it by hand forces that version.
// Without any tag yet, the first release uses package.json's version as is.

const { execSync } = require('node:child_process');
const pkg = require('../package.json');

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const floor = parse(pkg.version);
let last = null;
try { last = sh('git describe --tags --abbrev=0 --match "v[0-9]*"'); } catch { /* no release tag yet */ }

if (!last) {
  console.log(floor.join('.'));
  process.exit(0);
}

const messages = sh(`git log ${last}..HEAD --format=%B%x1e`).split('\x1e').map((m) => m.trim()).filter(Boolean);
if (!messages.length) process.exit(0);

let bump = 'patch';
for (const m of messages) {
  if (/^\w+(\([^)]*\))?!:/.test(m) || /BREAKING CHANGE/.test(m)) { bump = 'major'; break; }
  if (/^feat(\([^)]*\))?:/.test(m)) bump = 'minor';
}

const [major, minor, patch] = parse(last);
let next = bump === 'major' ? [major + 1, 0, 0] : bump === 'minor' ? [major, minor + 1, 0] : [major, minor, patch + 1];
if (cmp(floor, next) > 0) next = floor;
console.log(next.join('.'));
