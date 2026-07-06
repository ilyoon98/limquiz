const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'decks.json');
const SHEET_NAME = '추천덱';

const workbook = XLSX.readFile(XLSX_PATH);

if (!workbook.SheetNames.includes(SHEET_NAME)) {
  console.error(`시트 "${SHEET_NAME}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const sheet = workbook.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

function splitKeywords(raw) {
  const s = String(raw || '').trim();
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(s.slice(i, i + 2));
  return out.filter(Boolean);
}

// 덱href 기준으로 그룹핑 (덱명은 서로 다른 덱끼리 중복될 수 있어 사용하지 않음)
const byHref = new Map();
for (const row of rows) {
  const href = String(row['덱href'] || '').trim();
  if (!href) continue;
  if (!byHref.has(href)) byHref.set(href, []);
  byHref.get(href).push(row);
}

function toMember(r) {
  return {
    수감자: String(r['수감자'] || '').trim(),
    인격명: String(r['인격명'] || '').trim(),
    성급: String(r['성급'] || '').trim(),
    키워드: splitKeywords(r['키워드']),
  };
}

const decks = [...byHref.entries()].map(([href, memberRows]) => {
  const deckName = String(memberRows[0]['덱명'] || '').trim();
  const structure = String(memberRows[0]['구조'] || '').trim();
  const core = memberRows.filter(r => String(r['구분']).trim() === '핵심').map(toMember);
  const general = memberRows.filter(r => String(r['구분']).trim() === '일반').map(toMember);
  const keywordSet = new Set();
  memberRows.forEach(r => splitKeywords(r['키워드']).forEach(k => keywordSet.add(k)));
  return { deckName, deckHref: href, structure, keywords: [...keywordSet], core, general };
});

fs.writeFileSync(OUT_PATH, JSON.stringify(decks, null, 0), 'utf8');
console.log(`✓ decks.json 생성 완료: ${decks.length}개 덱`);
