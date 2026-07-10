const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'CharacterTable.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'data.json');
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

const workbook = XLSX.readFile(XLSX_PATH);

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

let missingSlug = 0;
let missingAwakenFile = 0;
const data = charRows.map(row => {
  const entry = {};
  for (const field of CHAR_FIELDS) entry[field] = cleanVal(row[field]);

  const skillRow = skillById.get(row['ID']) || {};
  for (const field of SKILL_FIELDS) entry[field] = cleanVal(skillRow[field]);

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

fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0), 'utf8');
console.log(`✓ data.json 생성 완료: ${data.length}개 인격${missingSlug ? ` (slug 누락 ${missingSlug}개)` : ''}${missingAwakenFile ? ` (각성 이미지 파일 없음 ${missingAwakenFile}개)` : ''}`);
