// Copies the zod contracts to the mobile app and the web panel until
// packages/shared exists (CLAUDE.md §2). Run from the API folder:
//   node scripts/copy-shared-contracts.mjs
// Strips the `.js` import suffix (the apps use bundler resolution) and adds a
// "do not edit" header. Edit the contracts here, in the API, only.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(apiRoot, 'src', 'shared-contracts');
const targets = [
  resolve(apiRoot, '..', 'daily-halth-app', 'src', 'shared-contracts'),
  resolve(apiRoot, '..', 'daily-health-panel', 'src', 'shared-contracts'),
];
const HEADER =
  '// Copied from the API (daily-health/src/shared-contracts) by scripts/copy-shared-contracts.mjs. Do not edit here.\n';

const files = readdirSync(source).filter((name) => name.endsWith('.ts'));
for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const name of files) {
    const text = readFileSync(join(source, name), 'utf8')
      .replace(/^\/\/ API contracts shared[^\n]*\n(\/\/[^\n]*\n)*/m, '')
      .replace(/(from\s+'\.\/[^']+)\.js'/g, "$1'");
    writeFileSync(join(target, name), HEADER + text);
  }
  console.log(`${files.length} contracts → ${target}`);
}
