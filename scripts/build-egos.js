const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'egoData.json');
const EGO_SHEET_NAME = 'EGOData';
const EGO_FIELDS = ['이름', '수감자', '등급', '속성', '자원', '아이콘'];

const REPO_ROOT = path.join(__dirname, '..');
function imageFileExists(relPath) {
  if (!relPath) return false;
  return fs.existsSync(path.join(REPO_ROOT, relPath.replace(/^\.\//, '')));
}

function cleanVal(val) {
  return (val === undefined || val === null || val !== val) ? '' : String(val).trim();
}

const workbook = XLSX.readFile(XLSX_PATH);

// EGO는 인격과 1:1 연동이 아닌 독립 아이템 풀이며, 사용자가 나중에 채워 넣을
// 예정이므로 시트가 아직 없어도 빌드를 막지 않고 빈 배열을 출력한다.
if (!workbook.SheetNames.includes(EGO_SHEET_NAME)) {
  console.log(`ℹ ${EGO_SHEET_NAME} 시트 없음: egoData.json을 빈 배열로 생성합니다 (EGO 퀴즈는 데이터 입력 전까지 비활성 상태로 동작).`);
  fs.writeFileSync(OUT_PATH, '[]', 'utf8');
  console.log('✓ egoData.json 생성 완료: 0개 EGO');
  process.exit(0);
}

const egoRows = XLSX.utils.sheet_to_json(workbook.Sheets[EGO_SHEET_NAME], { defval: '' });

let missingImage = 0;
const egos = egoRows
  .filter(row => row['ID'] !== '' && row['ID'] !== undefined && row['ID'] !== null)
  .map(row => {
    const entry = { ID: cleanVal(row['ID']) };
    for (const field of EGO_FIELDS) entry[field] = cleanVal(row[field]);

    if (entry['아이콘'] && !imageFileExists(entry['아이콘'])) {
      console.warn(`⚠ EGO 아이콘 파일 없음, 제외 처리: ${entry['이름'] || entry.ID} (${entry['아이콘']})`);
      entry['아이콘'] = '';
      missingImage++;
    }
    return entry;
  });

fs.writeFileSync(OUT_PATH, JSON.stringify(egos, null, 0), 'utf8');
console.log(`✓ egoData.json 생성 완료: ${egos.length}개 EGO${missingImage ? ` (아이콘 파일 없음 ${missingImage}개)` : ''}`);
