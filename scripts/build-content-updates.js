const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data.json');
const EGO_DATA_PATH = path.join(ROOT, 'egoData.json');
const IDENTITY_MANIFEST_PATH = path.join(ROOT, 'identityImageManifest.json');
const EGO_MANIFEST_PATH = path.join(ROOT, 'egoImageManifest.json');
// 기존 배포와의 호환을 위해 파일명은 유지하고, items.type으로 콘텐츠 종류를 구분한다.
const UPDATES_PATH = path.join(ROOT, 'identityUpdates.json');

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { return fallback; }
}

function imageExists(relPath) {
  return Boolean(relPath) && fs.existsSync(path.join(ROOT, relPath.replace(/^\.\//, '')));
}

function identityImages(entry) {
  return ['이미지(일반)', '이미지(각성)'].map(field => entry[field]).filter(imageExists);
}

const identities = readJson(DATA_PATH, []);
const egos = readJson(EGO_DATA_PATH, []);
const previousUpdates = readJson(UPDATES_PATH, { items: [] });
const previousIdentityManifest = readJson(IDENTITY_MANIFEST_PATH, null);
const previousEgoManifest = readJson(EGO_MANIFEST_PATH, null);

const identityImagesNow = [...new Set(identities.flatMap(identityImages))].sort();
const egoImagesNow = [...new Set(egos.map(ego => ego['아이콘']).filter(imageExists))].sort();
const previousIdentityImages = new Set(Array.isArray(previousIdentityManifest?.images) ? previousIdentityManifest.images : []);
const previousEgoImages = new Set(Array.isArray(previousEgoManifest?.images) ? previousEgoManifest.images : []);
const addedIdentityImages = new Set(identityImagesNow.filter(image => !previousIdentityImages.has(image)));
const addedEgoImages = new Set(egoImagesNow.filter(image => !previousEgoImages.has(image)));

let identityRows = identities.filter(entry => identityImages(entry).some(image => addedIdentityImages.has(image)));
let egoRows = egos.filter(ego => addedEgoImages.has(ego['아이콘']));

// manifest를 처음 도입하는 경우 전체 과거 데이터를 신규로 취급하지 않는다.
// 인격은 가장 최근 출시일 묶음, EGO는 가장 큰 숫자 ID 하나만 초기 안내 대상으로 삼는다.
if (!previousIdentityManifest && identityRows.length) {
  const latestDate = identityRows.reduce((latest, entry) => entry['출시일'] > latest ? entry['출시일'] : latest, '');
  identityRows = latestDate ? identityRows.filter(entry => entry['출시일'] === latestDate) : [];
}
if (!previousEgoManifest && egoRows.length) {
  const latestId = egoRows.reduce((latest, ego) => Number(ego.ID) > Number(latest.ID) ? ego : latest, egoRows[0]);
  egoRows = [latestId];
}

const identityItems = identityRows.map(entry => ({
  type: 'identity',
  id: entry['ID'],
  images: identityImages(entry).filter(image => !previousIdentityManifest || addedIdentityImages.has(image)).sort(),
}));
const egoItems = egoRows.map(ego => ({ type: 'ego', id: ego.ID, images: [ego['아이콘']] }));
let items = [...identityItems, ...egoItems];

// 이번 빌드에 실제 새 이미지가 없으면 기존 업데이트 묶음을 보존한다. 한쪽 manifest만
// 처음 생성하는 마이그레이션 빌드에서는 기존 타입 카드와 새 타입 카드를 합친다.
if (!items.length) {
  items = Array.isArray(previousUpdates?.items) ? previousUpdates.items : [];
} else if (!previousIdentityManifest || !previousEgoManifest) {
  const newTypes = new Set(items.map(item => item.type));
  const preserved = (Array.isArray(previousUpdates?.items) ? previousUpdates.items : [])
    .map(item => ({ ...item, type: item.type || 'identity' }))
    .filter(item => !newTypes.has(item.type));
  items = [...preserved, ...items];
}

fs.writeFileSync(UPDATES_PATH, JSON.stringify({ items }, null, 2) + '\n', 'utf8');
fs.writeFileSync(IDENTITY_MANIFEST_PATH, JSON.stringify({ images: identityImagesNow }, null, 2) + '\n', 'utf8');
fs.writeFileSync(EGO_MANIFEST_PATH, JSON.stringify({ images: egoImagesNow }, null, 2) + '\n', 'utf8');

const detected = [...identityItems, ...egoItems];
if (detected.length) console.log(`✓ 신규 콘텐츠 이미지 업데이트 감지: ${detected.map(item => `${item.type}:${item.id}`).join(', ')}`);
else console.log('✓ 신규 콘텐츠 이미지 없음: 기존 최초 1회 안내 묶음을 유지합니다.');
