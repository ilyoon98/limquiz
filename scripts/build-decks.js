const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'decks.json');
const DECK_SHEET_NAME = 'DeckData';
const CHAR_SHEET_NAME = 'CharacterData';

const workbook = XLSX.readFile(XLSX_PATH);

if (!workbook.SheetNames.includes(DECK_SHEET_NAME)) {
  console.error(`시트 "${DECK_SHEET_NAME}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const deckRows = XLSX.utils.sheet_to_json(workbook.Sheets[DECK_SHEET_NAME], { defval: '' });
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

// DeckData의 인격명은 종종 축약형(중간 타이틀 생략)이라, 토큰이 순서대로
// fullName 안에 등장하는지로 매칭한다. 예: "약지 이상" -> "약지 야수파 도슨트 이상"
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

const byId = new Map();
deckRows.forEach(row => {
  const id = row['ID'];
  if (id === '' || id === undefined || id === null) return;
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(row);
});

const decks = [...byId.entries()].map(([id, memberRows]) => {
  const deckName = String(memberRows[0]['Deck'] || '').trim();
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

fs.writeFileSync(OUT_PATH, JSON.stringify(decks, null, 0), 'utf8');
console.log(`✓ decks.json 생성 완료: ${decks.length}개 덱${unresolvedCount ? ` (매칭 실패 ${unresolvedCount}건)` : ''}`);
