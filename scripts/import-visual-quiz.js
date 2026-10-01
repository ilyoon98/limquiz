// One-time, explicit import. Never run during a deployment build.
// Metadata is committed; short-lived download references returned by Drive stay in .codex-tmp.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, '.codex-tmp', name), 'utf8'));
const manifest = require('../visualQuizImageManifest.json');
const bossReview = new Map(require('../visualQuizBossReview.json').map(row => [row.id, row]));
const characterReview = new Map(require('../visualQuizCharacterReview.json').map(row => [row.id, row]));
const refs = new Map(read('visual-downloads.json').map(x => [x.id, x.url]));
const cache = path.join(root, '.codex-tmp', 'visual-source');
fs.mkdirSync(cache, { recursive: true });
async function request(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { if (attempt === 2) throw error; }
  }
}
async function source(lang, file) {
  const dest = path.join(cache, `${lang}-${file}`);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, await request(`https://raw.githubusercontent.com/x1bViolet/Limbus-Localization-Files/${lang}/${file}`));
  return JSON.parse(fs.readFileSync(dest, 'utf8').replace(/^\uFEFF/, '')).dataList || [];
}
async function parallel(items, work) {
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < items.length) await work(items[i++]); }));
}
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
async function main() {
  const tree = { tree: require('../visualQuizSources.json').map(path => ({ path })) };
  const files = tree.tree.map(x => x.path).filter(x => /^(PanicInfo|AbnormalityGuides|Enemies).*\.json$/.test(x));
  const panic = new Map(), bosses = new Map(), bossNames = new Map();
  // Collect first, then merge deterministically so network completion order cannot select a name.
  const entries = new Map();
  await parallel(files, async file => {
    const ko = await source('Korean', file);
    const en = !file.startsWith('PanicInfo') ? await source('English', file) : [];
    entries.set(file, { ko, en });
  });
  for (const file of files.sort()) {
    const { ko, en } = entries.get(file);
    if (file.startsWith('PanicInfo')) for (const item of ko) panic.set(item.id, { ...item, file });
    else for (const item of ko) {
      const english = en.find(x => x.id === item.id)?.name;
      const row = { ...item, english, file };
      if (file.startsWith('Abnormality') && !bosses.has(item.id)) bosses.set(item.id, row);
      if (english && !bossNames.has(normalize(english))) bossNames.set(normalize(english), row);
    }
  }
  const keywordFiles = tree.tree.map(x => x.path).filter(x => /^BattleKeywords.*\.json$/.test(x));
  const keywordRows = new Map();
  await parallel(keywordFiles, async file => keywordRows.set(file, await source('Korean', file)));
  const keywords = new Map();
  for (const file of keywordFiles.sort()) for (const item of keywordRows.get(file)) if (item.name) keywords.set(String(item.id), item.name);
  const plain = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]/g, (full, key) => keywords.get(key) || full).trim();
  const result = { version: 1, sources: { images: 'https://drive.google.com/drive/folders/1DkcKQWgYLf9Kzk3JdsLHKxr1iei7XmrV', text: 'https://github.com/x1bViolet/Limbus-Localization-Files/tree/Korean' }, character: [], boss: [], panic: [] };
  const skipped = [];
  const jobs = [];
  for (const [mode, images] of Object.entries(manifest)) for (const image of images) {
    const stem = image.title.replace(/\.png$/i, '');
    let name = image.name, aliases = [], hints = [], chapter = image.chapter, sourceFile = '';
    if (mode === 'character') {
      const reviewed = characterReview.get(image.id);
      if (reviewed?.excluded) continue;
      if (reviewed) { name = reviewed.name; aliases = reviewed.aliases; chapter = reviewed.chapter; }
    }
    if (mode === 'boss') {
      const reviewed = bossReview.get(image.id);
      if (reviewed?.excluded) continue;
      const knownFileAliases = { 'Doomsday Clock': 'Doomsday Calendar', 'Everything There': 'Everything There of an Inquisitor' };
      const row = /^\d+$/.test(stem) ? bosses.get(Number(stem)) : bossNames.get(normalize(knownFileAliases[stem] || stem));
      if (!row?.name && !reviewed?.name) { skipped.push({ mode, file: image.title, reason: 'No exact localized name match' }); continue; }
      name = reviewed?.name || plain(row.name);
      aliases = [...new Set([row?.english, row?.name && plain(row.name), !/^\d+$/.test(stem) ? stem : null].filter(value => value && value !== name))];
      sourceFile = row?.file || '';
    }
    if (mode === 'panic') {
      const row = panic.get(parseInt(stem));
      if (!row?.panicName || row.panicName === '???') { skipped.push({ mode, file: image.title, reason: 'Unknown panic name' }); continue; }
      name = plain(row.panicName); sourceFile = row.file;
      chapter = Number(row.file.match(/a1c(\d+)/)?.[1] || 11);
      hints = [{ label: '사기저하', text: plain(row.lowMoraleDescription) }, { label: '패닉', text: plain(row.panicDescription) }].filter(x => x.text);
    }
    const id = `${mode}-${image.id}`;
    const imagePath = `images/visual-quiz/${id}.webp`;
    const row = { id, name, aliases, chapter, image: imagePath, hints, sourceImage: image.url, ...(image.location ? { location: image.location } : {}), ...(sourceFile ? { sourceText: `https://github.com/x1bViolet/Limbus-Localization-Files/blob/Korean/${sourceFile}` } : {}) };
    jobs.push({ mode, row, image });
  }
  fs.mkdirSync(path.join(root, 'images', 'visual-quiz'), { recursive: true });
  await parallel(jobs, async ({ mode, row, image }) => {
    const dest = path.join(root, row.image);
    if (!fs.existsSync(dest)) {
      if (!refs.has(image.id)) throw new Error(`No Drive download reference: ${image.title}`);
      const bytes = await request(refs.get(image.id));
      await sharp(bytes).webp({ quality: 90 }).toFile(dest);
    }
    const metadata = await sharp(dest).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Invalid image: ${image.title}`);
    result[mode].push(row);
  });
  for (const mode of ['character', 'boss', 'panic']) result[mode].sort((a, b) => a.chapter - b.chapter || a.name.localeCompare(b.name, 'ko'));
  fs.writeFileSync(path.join(root, 'visualQuizData.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(root, '.codex-tmp', 'visual-skipped.json'), JSON.stringify(skipped, null, 2));
  console.log(JSON.stringify({ counts: Object.fromEntries(['character', 'boss', 'panic'].map(k => [k, result[k].length])), skipped }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
