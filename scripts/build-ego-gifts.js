const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'egoGiftData.json');
const GIFT_SHEET_NAME = 'EGOGiftData';
const GIFT_FIELDS = ['이름', '등급', '속성', '키워드', '효과', '아이콘'];
const GIFT_SIN_ORDER = ['분노', '색욕', '나태', '탐식', '우울', '오만', '질투'];
const KNOWN_SINS = new Set(GIFT_SIN_ORDER);

const REPO_ROOT = path.join(__dirname, '..');
function imageFileExists(relPath) {
  if (!relPath) return false;
  return fs.existsSync(path.join(REPO_ROOT, relPath.replace(/^\.\//, '')));
}

function cleanVal(val) {
  return (val === undefined || val === null || val !== val) ? '' : String(val).trim();
}

// 원본의 attrKeywordId(속성)는 모든 기프트에 붙는 내부 분류값이며, 실제 효과의
// 죄악 속성 조건과 다를 수 있다. 퀴즈에서는 공명이나 특정 속성 스킬이 효과의
// 발동·강화 조건으로 쓰인 경우만 "조건속성"으로 비교한다.
function conditionalSinsOf(effect) {
  const lines = String(effect || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  return GIFT_SIN_ORDER.filter(sin => lines.some(line => {
    if (!line.includes(sin)) return false;
    if (line.includes('공명')) return true;

    // "우울 속성 피해"처럼 기프트가 가하는 피해의 속성은 발동 조건이 아니다.
    if (new RegExp(`${sin}\\s*속성\\s*피해`).test(line)) return false;
    if (line.includes('스킬') && line.includes('속성')) return true;

    // "오만 관통 스킬", "분노, 오만 스킬을 장착"처럼 '속성' 단어가 생략된 표기.
    if (new RegExp(`${sin}\\s+(?:관통|참격|타격)\\s*스킬`).test(line)) return true;
    return line.includes('장착') && new RegExp(`${sin}.{0,12}스킬`).test(line);
  }));
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
    entry['조건속성'] = conditionalSinsOf(entry['효과']);

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
