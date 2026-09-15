// 把 docs/diagrams/*.mmd 的 Mermaid 圖表轉成 README 用的圖片（深色與淺色主題各一張）
// 不依賴 GitHub 的 Mermaid 顯示功能，任何環境都能正常顯示。
// 執行：npm run readme:diagrams（不需要 Firebase 模擬器）
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../docs/diagrams/', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/images/', import.meta.url));
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

const THEMES = {
  dark: {
    primaryColor: '#1c2740', primaryBorderColor: '#d6a84c', primaryTextColor: '#efe6d2',
    secondaryColor: '#2b2414', tertiaryColor: '#161f33', lineColor: '#d6a84c', textColor: '#efe6d2',
    edgeLabelBackground: '#0d1117', clusterBkg: '#111a2e', clusterBorder: '#6b5520',
    fontFamily: FONT, fontSize: '16px',
  },
  light: {
    primaryColor: '#fff6df', primaryBorderColor: '#b8892f', primaryTextColor: '#2b1d08',
    secondaryColor: '#fdf0cf', tertiaryColor: '#fffaf0', lineColor: '#8d6521', textColor: '#2b1d08',
    edgeLabelBackground: '#ffffff', clusterBkg: '#fffaf0', clusterBorder: '#d6a84c',
    fontFamily: FONT, fontSize: '16px',
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 1000 } });

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.mmd'))) {
  const name = file.replace(/\.mmd$/, '');
  const source = readFileSync(`${SRC}${file}`, 'utf8');
  for (const [theme, themeVariables] of Object.entries(THEMES)) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent}#d{display:inline-block;padding:12px}</style>
</head><body><div id="d"></div></body></html>`);
    await page.addScriptTag({ url: MERMAID });
    await page.evaluate(() => document.fonts.load('16px "Noto Sans TC"').then(() => document.fonts.ready));
    const error = await page.evaluate(async ({ src, vars }) => {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: vars, flowchart: { curve: 'basis', padding: 14 } });
        const { svg } = await window.mermaid.render(`g${Date.now()}`, src);
        document.getElementById('d').innerHTML = svg;
        return null;
      } catch (e) {
        return e.message;
      }
    }, { src: source, vars: themeVariables });
    if (error) throw new Error(`${file}（${theme}）轉換失敗：${error}`);
    await page.locator('#d').screenshot({ path: `${OUT}diagram-${name}-${theme}.png`, omitBackground: true });
    console.log(`• diagram-${name}-${theme}.png`);
  }
}

await browser.close();
