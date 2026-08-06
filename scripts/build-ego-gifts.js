const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'egoGiftData.json');
const GIFT_SHEET_NAME = 'EGOGiftData';
const GIFT_FIELDS = ['이름', '등급', '속성', '효과', '아이콘'];
const KNOWN_SINS = new Set(['분노', '색욕', '나태', '탐식', '우울', '오만', '질투']);

const REPO_ROOT = path.join(__dirname, '..');
function imageFileExists(relPath) {
  if (!relPath) return false;
  return fs.existsSync(path.join(REPO_ROOT, relPath.replace(/^\.\//, '')));
}

function cleanVal(val) {
  return (val === undefined || val === null || val !== val) ? '' : String(val).trim();
}

const workbook = XLSX.readFile(XLSX_PATH);

// EGOGiftData는 인격과 무관한 독립 아이템 풀이며, 사용자가 나중에 채워 넣을
// 예정이므로 시트가 아직 없어도 빌드를 막지 않고 빈 배열을 출력한다.
if (!workbook.SheetNames.includes(GIFT_SHEET_NAME)) {
  console.log(`ℹ ${GIFT_SHEET_NAME} 시트 없음: egoGiftData.json을 빈 배열로 생성합니다 (EGO 기프트 퀴즈는 데이터 입력 전까지 비활성 상태로 동작).`);
  fs.writeFileSync(OUT_PATH, '[]', 'utf8');
  console.log('✓ egoGiftData.json 생성 완료: 0개 기프트');
  process.exit(0);
}

const giftRows = XLSX.utils.sheet_to_json(workbook.Sheets[GIFT_SHEET_NAME], { defval: '' });

let missingImage = 0;
let unknownSin = 0;
const gifts = giftRows
  .filter(row => row['ID'] !== '' && row['ID'] !== undefined && row['ID'] !== null)
  .map(row => {
    const entry = { ID: cleanVal(row['ID']) };
    for (const field of GIFT_FIELDS) entry[field] = cleanVal(row[field]);

    if (entry['속성'] && !KNOWN_SINS.has(entry['속성'])) {
      console.warn(`⚠ 알 수 없는 속성 값: "${entry['속성']}" (기프트: ${entry['이름'] || entry.ID})`);
      unknownSin++;
    }
    if (entry['아이콘'] && !imageFileExists(entry['아이콘'])) {
      console.warn(`⚠ 기프트 아이콘 파일 없음, 제외 처리: ${entry['이름'] || entry.ID} (${entry['아이콘']})`);
      entry['아이콘'] = '';
      missingImage++;
    }
    return entry;
  });

fs.writeFileSync(OUT_PATH, JSON.stringify(gifts, null, 0), 'utf8');
console.log(`✓ egoGiftData.json 생성 완료: ${gifts.length}개 기프트${unknownSin ? ` (속성 불명 ${unknownSin}개)` : ''}${missingImage ? ` (아이콘 파일 없음 ${missingImage}개)` : ''}`);
