const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'data.json');
const SLUG_MAP_PATH = path.join(__dirname, 'slug-map.json');
const SHEET_NAME = 'CharacterData';
const FIELDS = [
  '수감자', '인격명', '성급', '소속1', '소속2',
  '키워드1', '키워드2', '키워드3',
  '스킬1명', '스킬1속성', '스킬1유형', '스킬1아이콘',
  '스킬2명', '스킬2속성', '스킬2유형', '스킬2아이콘',
  '스킬3명', '스킬3속성', '스킬3유형', '스킬3아이콘',
  '이미지(일반)', '이미지(각성)', '프로필(각성)',
];

const slugMap = JSON.parse(fs.readFileSync(SLUG_MAP_PATH, 'utf8'));

const workbook = XLSX.readFile(XLSX_PATH);

if (!workbook.SheetNames.includes(SHEET_NAME)) {
  console.error(`시트 "${SHEET_NAME}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const sheet = workbook.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

let missingSlug = 0;
const data = rows.map(row => {
  const entry = {};
  for (const field of FIELDS) {
    const val = row[field];
    entry[field] = (val === undefined || val === null || val !== val) ? '' : String(val).trim();
  }
  const slug = slugMap[entry['인격명']] || '';
  if (!slug) { console.warn(`⚠ slug 없음: ${entry['인격명']}`); missingSlug++; }
  entry['slug'] = slug;
  return entry;
});

fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0), 'utf8');
console.log(`✓ data.json 생성 완료: ${data.length}개 인격${missingSlug ? ` (slug 누락 ${missingSlug}개)` : ''}`);
