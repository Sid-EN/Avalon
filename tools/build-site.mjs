// 輸出要部署到 GitHub Pages 的檔案到 _site/（排除測試、工具與 node_modules）
import { cpSync, rmSync, mkdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('../_site/', import.meta.url);
const SITE_FILES = ['index.html', '.nojekyll', 'css', 'js', 'assets'];

const config = readFileSync(new URL('js/firebase-config.js', root), 'utf8');
if (config.includes('REPLACE_ME')) {
  console.error('✗ js/firebase-config.js 還是範本內容，請先填入 Firebase 設定（見 docs/SETUP.md）');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const item of SITE_FILES) cpSync(new URL(item, root), new URL(item, out), { recursive: true });
console.log(`✓ 網站已輸出到 _site/（${SITE_FILES.join('、')}）`);
