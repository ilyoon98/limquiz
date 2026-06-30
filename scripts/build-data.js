const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'data.json');
const SHEET_NAME = 'CharacterData';
const FIELDS = ['수감자', '인격명', '성급', '키워드1', '키워드2', '키워드3'];

const workbook = XLSX.readFile(XLSX_PATH);

if (!workbook.SheetNames.includes(SHEET_NAME)) {
  console.error(`시트 "${SHEET_NAME}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const sheet = workbook.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const data = rows.map(row => {
  const entry = {};
  for (const field of FIELDS) {
    const val = row[field];
    entry[field] = (val === undefined || val === null || val !== val) ? '' : String(val).trim();
  }
  return entry;
});

fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0), 'utf8');
console.log(`✓ data.json 생성 완료: ${data.length}개 인격`);
