/**
 * Validates the PAYLOAD data structure embedded in index.html.
 *
 * The hub is a single self-contained HTML file whose entire content lives in one
 * JavaScript object literal. A malformed payload or a reference key that points at
 * nothing renders a broken page with no build-time warning, so this script acts as
 * the status check for pull requests.
 *
 * Checks performed:
 *   1. The PAYLOAD line exists and parses as JSON.
 *   2. Every module and lesson carries the fields the renderer expects.
 *   3. Module and lesson identifiers are unique.
 *   4. Every reference key cited by a module or lesson exists in the refs registry.
 *   5. Every entry in the refs registry has an author, title and an absolute https URL.
 *   6. No reference is orphaned without being reachable from somewhere in the hub.
 *
 * Exits non-zero with a list of problems when any check fails.
 */

const fs = require('fs');
const path = require('path');

const HUB = path.join(__dirname, '..', '..', 'index.html');
const PREFIX = 'const PAYLOAD = ';

const errors = [];
const warnings = [];

const source = fs.readFileSync(HUB, 'utf8');
const line = source.split('\n').find((l) => l.startsWith(PREFIX));

if (!line) {
  console.error(`FAIL: no line starting with "${PREFIX}" found in index.html`);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(line.slice(PREFIX.length).replace(/;\s*$/, ''));
} catch (err) {
  console.error('FAIL: PAYLOAD is not valid JSON: ' + err.message);
  process.exit(1);
}

const REQUIRED_MODULE_FIELDS = ['id', 'name', 'blurb', 'lessons'];
const REQUIRED_LESSON_FIELDS = ['id', 'title', 'what', 'understand', 'applyPM', 'refs'];

if (!Array.isArray(payload.modules) || payload.modules.length === 0) {
  errors.push('payload.modules is missing or empty');
}
if (!payload.refs || typeof payload.refs !== 'object') {
  errors.push('payload.refs is missing');
}

const refKeys = new Set(Object.keys(payload.refs || {}));
const usedRefs = new Set();
const moduleIds = new Set();
const lessonIds = new Set();

for (const mod of payload.modules || []) {
  for (const field of REQUIRED_MODULE_FIELDS) {
    if (!mod[field]) errors.push(`module "${mod.id || '?'}" is missing field "${field}"`);
  }

  if (moduleIds.has(mod.id)) errors.push(`duplicate module id "${mod.id}"`);
  moduleIds.add(mod.id);

  for (const key of mod.refs || []) {
    usedRefs.add(key);
    if (!refKeys.has(key)) errors.push(`module "${mod.id}" cites unknown ref "${key}"`);
  }

  for (const lesson of mod.lessons || []) {
    for (const field of REQUIRED_LESSON_FIELDS) {
      if (!lesson[field]) errors.push(`lesson "${lesson.id || '?'}" is missing field "${field}"`);
    }

    if (lessonIds.has(lesson.id)) errors.push(`duplicate lesson id "${lesson.id}"`);
    lessonIds.add(lesson.id);

    if (lesson.applyPM && !Array.isArray(lesson.applyPM)) {
      errors.push(`lesson "${lesson.id}" has a non-array applyPM`);
    }
    if (lesson.scenarios && !Array.isArray(lesson.scenarios)) {
      errors.push(`lesson "${lesson.id}" has a non-array scenarios`);
    }
    for (const scenario of lesson.scenarios || []) {
      if (!scenario.title || !scenario.body) {
        errors.push(`lesson "${lesson.id}" has a scenario missing title or body`);
      }
    }

    for (const key of lesson.refs || []) {
      usedRefs.add(key);
      if (!refKeys.has(key)) errors.push(`lesson "${lesson.id}" cites unknown ref "${key}"`);
    }
  }
}

for (const [key, ref] of Object.entries(payload.refs || {})) {
  if (!ref.author) errors.push(`ref "${key}" is missing an author`);
  if (!ref.title) errors.push(`ref "${key}" is missing a title`);
  if (!ref.url) {
    errors.push(`ref "${key}" is missing a url`);
  } else if (!/^https:\/\//.test(ref.url)) {
    errors.push(`ref "${key}" url is not absolute https: ${ref.url}`);
  }
}

for (const key of refKeys) {
  if (!usedRefs.has(key)) warnings.push(`ref "${key}" is defined but never cited`);
}

const lessonCount = (payload.modules || []).reduce((n, m) => n + (m.lessons || []).length, 0);

if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((w) => console.log('  - ' + w));
  console.log('');
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} problem(s) in the hub payload:`);
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}

console.log('PASS: hub payload is valid.');
console.log(`  modules: ${(payload.modules || []).length}`);
console.log(`  lessons: ${lessonCount}`);
console.log(`  refs:    ${refKeys.size} (${usedRefs.size} cited)`);
