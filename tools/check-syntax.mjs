// 檢查所有 JavaScript 檔案的語法：node tools/check-syntax.mjs
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.m?js$/.test(name)) files.push(path);
  }
};
['js', 'tools', 'tests'].forEach((d) => walk(join(root, d)));
files.push(join(root, 'playwright.config.mjs'));

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    console.error(`✗ ${relative(root, file)}\n${result.stderr}`);
  }
}
console.log(`語法檢查：${files.length - failed}／${files.length} 個檔案通過`);
process.exit(failed ? 1 : 0);
