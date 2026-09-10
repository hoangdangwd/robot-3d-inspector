// Lightweight release security smoke: no secrets or executable tactic paths.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const files = [];
for await (const file of glob('{src,worker,dist}/**/*.{js,mjs,html}', { cwd: process.cwd() })) files.push(file);
const banned = [/\beval\s*\(/, /\bnew\s+Function\s*\(/, /\bFunction\s*\(/, /sk-[A-Za-z0-9]{20,}/];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const pattern of banned) assert.doesNotMatch(text, pattern, `${file} contains prohibited pattern ${pattern}`);
}
console.log(`PASS: security release smoke; scanned ${files.length} JS/HTML files.`);
