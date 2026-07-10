const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'UpdateLog.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'changelog.json');
// 개발자용 로그는 배포 루트(outputDirectory=".") 밖이 아니라 dev/ 하위에 두고
// .vercelignore로 배포에서 제외한다. index.html은 이 파일을 fetch하지 않는다.
const DEV_OUT_DIR = path.join(__dirname, '..', 'dev');
const DEV_OUT_PATH = path.join(DEV_OUT_DIR, 'changelog_dev.json');
const SHEET_NAME = 'UpdateLog';

const workbook = XLSX.readFile(XLSX_PATH);

if (!workbook.SheetNames.includes(SHEET_NAME)) {
  console.error(`시트 "${SHEET_NAME}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const sheet = workbook.Sheets[SHEET_NAME];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

function toLines(text) {
  return String(text || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
}

// 사용자용 Log가 채워진 행만 공개 changelog.json에 포함
const publicData = rows
  .filter(row => String(row['버전'] || '').trim() && toLines(row['사용자용 Log']).length)
  .map(row => ({
    버전: String(row['버전'] || '').trim(),
    날짜: String(row['날짜'] || '').trim(),
    내용: toLines(row['사용자용 Log']),
  }));

fs.writeFileSync(OUT_PATH, JSON.stringify(publicData, null, 0), 'utf8');
console.log(`✓ changelog.json 생성 완료: ${publicData.length}개 버전`);

// 개발자용 Log는 전체 버전 포함, 배포되지 않는 dev/ 폴더에만 생성
const devData = rows
  .filter(row => String(row['버전'] || '').trim())
  .map(row => ({
    버전: String(row['버전'] || '').trim(),
    날짜: String(row['날짜'] || '').trim(),
    내용: toLines(row['개발자용 Log']),
  }));

fs.mkdirSync(DEV_OUT_DIR, { recursive: true });
fs.writeFileSync(DEV_OUT_PATH, JSON.stringify(devData, null, 0), 'utf8');
console.log(`✓ dev/changelog_dev.json 생성 완료: ${devData.length}개 버전 (배포 제외)`);
