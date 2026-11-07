// Builds the public site in docs/ from the Mac app's frontend, so a fix there reaches the web
// version by re-running this. Each patch must match, or the build stops rather than publish a
// page that quietly lost a change.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = import.meta.dirname;
const macPublic = path.join(root, '..', 'tak-dental-ig', 'public');
const docs = path.join(root, 'docs');

function patch(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`patch must match exactly once: ${from}`);
  return text.replace(from, () => to);
}

await rm(docs, { recursive: true, force: true });
await mkdir(docs, { recursive: true });

for (const file of ['style.css', 'calendar.css', 'calendar-typo.png']) {
  await cp(path.join(macPublic, file), path.join(docs, file));
}
for (const file of await readdir(path.join(root, 'web'))) {
  await cp(path.join(root, 'web', file), path.join(docs, file));
}

let calendar = await readFile(path.join(macPublic, 'calendar.js'), 'utf8');
calendar = patch(calendar, 'クリックして確定', 'タップして確定');
await writeFile(path.join(docs, 'calendar.js'), calendar);

let app = await readFile(path.join(macPublic, 'app.js'), 'utf8');
app = patch(app, `'<span class="dot"></span> Ollama 接続済み'`, `'<span class="dot"></span> Gemini 設定済み'`);
app = patch(app, `'<span class="dot"></span> Ollama 未起動'`, `'<span class="dot"></span> Gemini 未設定'`);
app = patch(app, 'showToast(`モデルを「${ollamaModel}」に設定しました`);\n    closeSettingsModal();',
  `showToast('設定を保存しました');\n    closeSettingsModal();\n    loadSettings();`);
app = patch(app, `'ダウンロード完了！outputフォルダにも保存されました'`, `'ダウンロード完了！'`);
app = patch(app, '未設定（Ollamaを使用）', '未設定');
await writeFile(path.join(docs, 'app.js'), app);

let html = await readFile(path.join(macPublic, 'index.html'), 'utf8');
html = patch(html, '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#111111">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="IGツール">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="icon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Kiwi+Maru:wght@400;500&family=Noto+Sans+JP:wght@400;700;900&family=Noto+Serif+JP:wght@400;700&display=swap">`);
html = patch(html, '<link rel="stylesheet" href="calendar.css">',
  '<link rel="stylesheet" href="calendar.css">\n  <link rel="stylesheet" href="web.css">');
html = patch(html, '<script src="app.js"></script>', '<script src="web-api.js"></script>\n  <script src="app.js"></script>');
html = patch(html, '。未設定時はローカルのOllamaにフォールバックします。', '。');
await writeFile(path.join(docs, 'index.html'), html);

// Frames and icons have no server to list them, so ship the lists as files.
await cp(path.join(root, 'assets', 'frames'), path.join(docs, 'frames'), { recursive: true });
await cp(path.join(root, 'assets', 'icons'), path.join(docs, 'icons'), { recursive: true });

const frames = [];
for (const id of (await readdir(path.join(docs, 'frames'))).sort()) {
  const dir = path.join(docs, 'frames', id);
  const config = JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'));
  const overlay = (await readdir(dir)).find((f) => /^overlay\.(svg|png)$/.test(f));
  frames.push({ id, name: config.name, description: config.description || '', overlayUrl: `frames/${id}/${overlay}`, config });
}
await writeFile(path.join(docs, 'frames', 'index.json'), JSON.stringify(frames));

const icons = (await readdir(path.join(docs, 'icons')))
  .filter((f) => /\.(png|svg|jpe?g|webp)$/i.test(f))
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({ name, url: `icons/${encodeURIComponent(name)}` }));
await writeFile(path.join(docs, 'icons', 'index.json'), JSON.stringify(icons));

await writeFile(path.join(docs, '.nojekyll'), '');
console.log(`built docs/: ${frames.length} frames, ${icons.length} icons`);
