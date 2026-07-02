const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'UpdateLog.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'changelog.json');
const SHEET_NAME = 'UpdateLog';

const workbook = XLSX.readFile(XLSX_PATH);

if (!workbook.SheetNames.includes(SHEET_NAME)) {
  console.error(`시트 "${SHEET_NAME}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const sheet = workbook.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const data = rows.map(row => ({
  버전: String(row['버전'] || '').trim(),
  날짜: String(row['날짜'] || '').trim(),
  내용: String(row['내용'] || '').trim().split('\n').map(s => s.trim()).filter(Boolean),
})).filter(r => r.버전);

fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0), 'utf8');
console.log(`✓ changelog.json 생성 완료: ${data.length}개 버전`);
