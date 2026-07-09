const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const DECKS_OUT_PATH = path.join(__dirname, '..', 'decks.json');
const KEYWORDS_OUT_PATH = path.join(__dirname, '..', 'deckKeywords.json');
const DECK_SHEET_NAME = 'DeckData';
const DECK_INFO_SHEET_NAME = 'DeckInfo';
const CHAR_SHEET_NAME = 'CharacterData';

const workbook = XLSX.readFile(XLSX_PATH);

[DECK_SHEET_NAME, DECK_INFO_SHEET_NAME, CHAR_SHEET_NAME].forEach(name => {
  if (!workbook.SheetNames.includes(name)) {
    console.error(`시트 "${name}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }
});

const deckRows = XLSX.utils.sheet_to_json(workbook.Sheets[DECK_SHEET_NAME], { defval: '' });
const deckInfoRows = XLSX.utils.sheet_to_json(workbook.Sheets[DECK_INFO_SHEET_NAME], { defval: '' });
const charRows = XLSX.utils.sheet_to_json(workbook.Sheets[CHAR_SHEET_NAME], { defval: '' });

// 수감자별 인격명 목록 (이름 매칭용)
const bySinner = new Map();
charRows.forEach(r => {
  const sinner = String(r['수감자'] || '').trim();
  const name = String(r['인격명'] || '').trim();
  if (!sinner || !name) return;
  if (!bySinner.has(sinner)) bySinner.set(sinner, []);
  bySinner.get(sinner).push(name);
});

// DeckData의 인격명은 종종 축약형(중간 타이틀 생략)이거나 공백 등 사소한 오타가 있어서,
// 토큰이 순서대로 fullName 안에 등장하는지로 매칭한다.
// 예: "약지 이상" -> "약지 야수파 도슨트 이상"
function isOrderedSubsequence(shortName, fullName) {
  const tokens = shortName.split(/\s+/).filter(Boolean);
  let idx = 0;
  for (const t of tokens) {
    const found = fullName.indexOf(t, idx);
    if (found === -1) return false;
    idx = found + t.length;
  }
  return true;
}

let unresolvedCount = 0;
function resolveName(shortName, sinner) {
  const candidates = bySinner.get(sinner) || [];
  if (candidates.includes(shortName)) return shortName;
  const matches = candidates.filter(full => isOrderedSubsequence(shortName, full));
  if (!matches.length) {
    console.warn(`⚠ 매칭 실패: "${shortName}" (수감자: ${sinner}) - CharacterData에서 후보를 찾지 못해 원본 텍스트 유지`);
    unresolvedCount++;
    return shortName;
  }
  matches.sort((a, b) => a.length - b.length);
  if (matches.length > 1) {
    console.warn(`⚠ 다중 매칭: "${shortName}" (수감자: ${sinner}) → [${matches.join(' | ')}] 중 "${matches[0]}" 선택`);
  }
  return matches[0];
}

// ── DeckData를 ID별로 그룹화 ─────────────────────────────
const byId = new Map();
deckRows.forEach(row => {
  const id = row['ID'];
  if (id === '' || id === undefined || id === null) return;
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(row);
});

// ── DeckInfo를 ID별로 매핑 ───────────────────────────────
const infoById = new Map();
deckInfoRows.forEach(row => {
  const id = row['ID'];
  if (id === '' || id === undefined || id === null) return;
  infoById.set(id, row);
});

// ── ID 집합 검증: 두 시트가 정확히 일치해야 함 ───────────
const deckDataIds = new Set(byId.keys());
const deckInfoIds = new Set(infoById.keys());
const onlyInDeckData = [...deckDataIds].filter(id => !deckInfoIds.has(id));
const onlyInDeckInfo = [...deckInfoIds].filter(id => !deckDataIds.has(id));
if (onlyInDeckData.length || onlyInDeckInfo.length) {
  console.error('✗ DeckData와 DeckInfo의 ID 집합이 일치하지 않습니다.');
  if (onlyInDeckData.length) console.error(`  DeckData에만 있음: ${onlyInDeckData.join(', ')}`);
  if (onlyInDeckInfo.length) console.error(`  DeckInfo에만 있음: ${onlyInDeckInfo.join(', ')}`);
  process.exit(1);
}

// ── decks.json 생성 ──────────────────────────────────────
const decks = [...byId.entries()].map(([id, memberRows]) => {
  const deckName = String(infoById.get(id)['Name'] || '').trim();

  // Main 타입 order 검증: 0 이하이거나 중복이면 경고
  const mainOrders = memberRows.filter(r => String(r['Type']).trim() === 'Main').map(r => Number(r['순서']) || 0);
  mainOrders.forEach(o => {
    if (o <= 0) console.warn(`⚠ ID ${id}(${deckName}): Main 타입인데 순서 값이 ${o}입니다.`);
  });
  const dupOrders = mainOrders.filter((o, i) => mainOrders.indexOf(o) !== i);
  if (dupOrders.length) {
    console.warn(`⚠ ID ${id}(${deckName}): Main 순서 값이 중복됩니다 (${[...new Set(dupOrders)].join(', ')}).`);
  }

  const slots = memberRows.map(r => {
    const sinner = String(r['수감자'] || '').trim();
    const type = String(r['Type'] || '').trim();
    const rawName = String(r['인격명'] || '').trim();
    const order = Number(r['순서']) || 0;
    const 인격명 = type === 'Null' ? null : resolveName(rawName, sinner);
    return { 수감자: sinner, 인격명, type, order };
  });
  return { id, deckName, slots };
});

fs.writeFileSync(DECKS_OUT_PATH, JSON.stringify(decks, null, 0), 'utf8');
console.log(`✓ decks.json 생성 완료: ${decks.length}개 덱${unresolvedCount ? ` (매칭 실패 ${unresolvedCount}건)` : ''}`);

// ── deckKeywords.json 생성 ───────────────────────────────
const keywordCols = ['Keyword1', 'Keyword2', 'Keyword3', 'Keyword4'];
const deckKeywords = {};
[...infoById.entries()].forEach(([id, row]) => {
  const keywords = keywordCols
    .map(col => String(row[col] || '').trim())
    .filter(Boolean);
  deckKeywords[String(id)] = { 덱이름: String(row['Name'] || '').trim(), keywords };
});

fs.writeFileSync(KEYWORDS_OUT_PATH, JSON.stringify(deckKeywords, null, 0), 'utf8');
console.log(`✓ deckKeywords.json 생성 완료: ${Object.keys(deckKeywords).length}개 덱`);
