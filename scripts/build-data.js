const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'data.json');
const IDENTITY_IMAGE_MANIFEST_PATH = path.join(__dirname, '..', 'identityImageManifest.json');
const IDENTITY_UPDATES_PATH = path.join(__dirname, '..', 'identityUpdates.json');
const SLUG_MAP_PATH = path.join(__dirname, 'slug-map.json');
const CHAR_SHEET_NAME = 'CharacterData';
const SKILL_SHEET_NAME = 'SkillData';

const CHAR_FIELDS = [
  'ID',
  '수감자', '인격명', '성급', '소속1', '소속2',
  '키워드1', '키워드2', '키워드3',
  '이미지(일반)', '이미지(각성)',
];
const SKILL_FIELDS = [
  '스킬1명', '스킬1속성', '스킬1유형', '스킬1아이콘',
  '스킬2명', '스킬2속성', '스킬2유형', '스킬2아이콘',
  '스킬3명', '스킬3속성', '스킬3유형', '스킬3아이콘',
];

const slugMap = JSON.parse(fs.readFileSync(SLUG_MAP_PATH, 'utf8'));

// cellDates:true로 읽어야 '출시일' 같은 엑셀 날짜 셀이 Date 객체로 파싱된다.
const workbook = XLSX.readFile(XLSX_PATH, { cellDates: true });

[CHAR_SHEET_NAME, SKILL_SHEET_NAME].forEach(name => {
  if (!workbook.SheetNames.includes(name)) {
    console.error(`시트 "${name}"를 찾을 수 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }
});

const charRows = XLSX.utils.sheet_to_json(workbook.Sheets[CHAR_SHEET_NAME], { defval: '' });
const skillRows = XLSX.utils.sheet_to_json(workbook.Sheets[SKILL_SHEET_NAME], { defval: '' });

// ── CharacterData/SkillData ID 집합 검증 ─────────────────
const skillById = new Map();
skillRows.forEach(row => {
  const id = row['ID'];
  if (id === '' || id === undefined || id === null) return;
  skillById.set(id, row);
});

const charIds = new Set(charRows.map(r => r['ID']).filter(id => id !== '' && id !== undefined && id !== null));
const skillIds = new Set(skillById.keys());
const onlyInChar = [...charIds].filter(id => !skillIds.has(id));
const onlyInSkill = [...skillIds].filter(id => !charIds.has(id));
if (onlyInChar.length || onlyInSkill.length) {
  console.error('✗ CharacterData와 SkillData의 ID 집합이 일치하지 않습니다.');
  if (onlyInChar.length) console.error(`  CharacterData에만 있음: ${onlyInChar.join(', ')}`);
  if (onlyInSkill.length) console.error(`  SkillData에만 있음: ${onlyInSkill.join(', ')}`);
  process.exit(1);
}

function cleanVal(val) {
  return (val === undefined || val === null || val !== val) ? '' : String(val).trim();
}

// 1성(LCB 수감자) 등 실제로는 각성 이미지가 없는 인격의 경우, 엑셀 값이
// 존재하지 않는 파일을 가리킬 수 있다. 로컬에 실제 파일이 있는지 확인해서
// 없으면 빈 값으로 처리한다 (깨진 이미지 노출 방지).
const REPO_ROOT = path.join(__dirname, '..');
function imageFileExists(relPath) {
  if (!relPath) return false;
  return fs.existsSync(path.join(REPO_ROOT, relPath.replace(/^\.\//, '')));
}

// 엑셀 날짜 셀은 cellDates:true 옵션으로 Date 객체로 파싱된다(UTC 자정 기준).
// 로컬 getter를 쓰면 타임존에 따라 하루 밀릴 수 있으므로 UTC getter를 사용한다.
// 이미 'YYYY-MM-DD' 형식의 문자열이 들어있으면 그대로 인정하고, 그 외 형식은
// 오기입으로 보고 경고 후 빈 값 처리한다(신규 인격 팝업 오작동 방지).
function formatReleaseDate(val) {
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = cleanVal(val);
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  console.warn(`⚠ 출시일 형식을 인식할 수 없어 무시합니다: "${str}" (엑셀 날짜 셀로 입력해주세요)`);
  return '';
}

let missingSlug = 0;
let missingAwakenFile = 0;
const data = charRows.map(row => {
  const entry = {};
  for (const field of CHAR_FIELDS) entry[field] = cleanVal(row[field]);

  const skillRow = skillById.get(row['ID']) || {};
  for (const field of SKILL_FIELDS) entry[field] = cleanVal(skillRow[field]);

  entry['출시일'] = formatReleaseDate(row['출시일']);

  if (entry['이미지(각성)'] && !imageFileExists(entry['이미지(각성)'])) {
    console.warn(`⚠ 각성 이미지 파일 없음, 제외 처리: ${entry['인격명']} (${entry['이미지(각성)']})`);
    entry['이미지(각성)'] = '';
    missingAwakenFile++;
  }

  const slug = slugMap[entry['인격명']] || '';
  if (!slug) { console.warn(`⚠ slug 없음: ${entry['인격명']}`); missingSlug++; }
  entry['slug'] = slug;
  return entry;
});

// 최근 7일 이내 출시일을 가진 인격이 비정상적으로 많으면 대량 오기입 가능성을 알린다(빌드는 막지 않음).
const recentCutoff = Date.now() - 7 * 86400000;
const recentCount = data.filter(e => e['출시일'] && new Date(e['출시일'] + 'T00:00:00Z').getTime() >= recentCutoff).length;
if (recentCount > 20) {
  console.warn(`⚠ 최근 7일 이내 출시일을 가진 인격이 ${recentCount}개나 됩니다. 출시일 컬럼을 잘못 채우지 않았는지 확인해주세요.`);
}

fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0), 'utf8');
console.log(`✓ data.json 생성 완료: ${data.length}개 인격${missingSlug ? ` (slug 누락 ${missingSlug}개)` : ''}${missingAwakenFile ? ` (각성 이미지 파일 없음 ${missingAwakenFile}개)` : ''}`);

// 신규 인격 팝업은 출시일을 사람이 일일이 관리하는 대신, 실제로 추가된 인격 이미지
// 파일을 추적한다. manifest는 직전 빌드에 존재했던 이미지 목록이며, 새 경로가 생기면
// 해당 ID와 새 이미지 경로를 identityUpdates.json에 남긴다. 새 이미지가 없는 빌드에서는
// 기존 업데이트 묶음을 보존해 아직 방문하지 않은 사용자도 팝업을 볼 수 있게 한다.
function identityImagePaths(entry) {
  return ['이미지(일반)', '이미지(각성)']
    .map(field => entry[field])
    .filter(relPath => relPath && imageFileExists(relPath));
}

let previousImages = [];
let hadImageManifest = false;
try {
  const previousManifest = JSON.parse(fs.readFileSync(IDENTITY_IMAGE_MANIFEST_PATH, 'utf8'));
  previousImages = Array.isArray(previousManifest?.images) ? previousManifest.images : [];
  hadImageManifest = true;
} catch (e) {
  // 최초 도입 빌드에서는 현재 이미지 전체를 기준선으로 저장하고, 가장 최근 출시일의
  // 인격만 최초 안내 대상으로 삼는다.
}

const currentImages = [...new Set(data.flatMap(identityImagePaths))].sort();
const previousImageSet = new Set(previousImages);
const addedImageSet = new Set(currentImages.filter(relPath => !previousImageSet.has(relPath)));
let updatedRows = data.filter(entry => identityImagePaths(entry).some(relPath => addedImageSet.has(relPath)));

if (!hadImageManifest && updatedRows.length) {
  const latestReleaseDate = updatedRows.reduce((latest, entry) => entry['출시일'] > latest ? entry['출시일'] : latest, '');
  updatedRows = latestReleaseDate ? updatedRows.filter(entry => entry['출시일'] === latestReleaseDate) : [];
}

if (updatedRows.length) {
  const items = updatedRows.map(entry => {
    const allImages = identityImagePaths(entry);
    const addedImages = hadImageManifest ? allImages.filter(relPath => addedImageSet.has(relPath)) : allImages;
    return { id: entry['ID'], images: addedImages.sort() };
  });
  fs.writeFileSync(IDENTITY_UPDATES_PATH, JSON.stringify({ items }, null, 2) + '\n', 'utf8');
  console.log(`✓ 신규 인격 이미지 업데이트 감지: ${items.map(item => item.id).join(', ')}`);
} else if (!fs.existsSync(IDENTITY_UPDATES_PATH)) {
  fs.writeFileSync(IDENTITY_UPDATES_PATH, JSON.stringify({ items: [] }, null, 2) + '\n', 'utf8');
}

fs.writeFileSync(IDENTITY_IMAGE_MANIFEST_PATH, JSON.stringify({ images: currentImages }, null, 2) + '\n', 'utf8');
