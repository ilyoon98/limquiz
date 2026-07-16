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

// DeckData의 인격명 컬럼은 이제 문자열이 아니라 CharacterData ID를 가리키는
// 숫자 참조다(Null 타입은 0). ID로 실제 인격명을 조회한다. 참고용 info 컬럼이
// 있으면 조회 실패 시 폴백으로 사용한다.
const charById = new Map();
charRows.forEach(r => {
  if (r['ID'] === '' || r['ID'] === undefined || r['ID'] === null) return;
  charById.set(Number(r['ID']), String(r['인격명'] || '').trim());
});

let unresolvedCount = 0;
function resolveName(idRef, sinner, fallbackInfo) {
  const resolved = charById.get(Number(idRef));
  if (resolved) return resolved;
  const fallback = String(fallbackInfo || '').trim();
  console.warn(`⚠ ID 조회 실패: "${idRef}" (수감자: ${sinner}) - CharacterData에서 ID를 찾지 못해 ${fallback ? `info 컬럼값("${fallback}")으로 대체` : '원본 값 유지'}`);
  unresolvedCount++;
  return fallback || String(idRef);
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
  // Main 목표 자리가 없음 전용 뒤쪽 구간(마지막 N칸)과 겹치면 클리어 불가능한 덱이 된다
  const nullCount = memberRows.filter(r => String(r['Type']).trim() === 'Null').length;
  const nullZoneStart = 12 - nullCount;
  mainOrders.forEach(o => {
    if (o - 1 >= nullZoneStart) console.warn(`⚠ ID ${id}(${deckName}): Main 순서 ${o}이(가) 없음 전용 구간(${nullZoneStart + 1}번 이후)과 겹칩니다. 클리어 불가능한 덱입니다.`);
  });

  const slots = memberRows.map(r => {
    const sinner = String(r['수감자'] || '').trim();
    const type = String(r['Type'] || '').trim();
    const idRef = r['인격명'];
    const order = Number(r['순서']) || 0;
    const 인격명 = type === 'Null' ? null : resolveName(idRef, sinner, r['info']);
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
