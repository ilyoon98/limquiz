const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'egoGiftLimitedPacks.json');
const SOURCE_URL = 'https://limbus.haneuk.info/api/user/egogift?size=500&page=0';

function normalizePackNames(names) {
  return [...new Set((Array.isArray(names) ? names : [])
    .flatMap(name => String(name).split(/"\s*,\s*"/))
    .map(name => name.replace(/^"+|"+$/g, '').trim())
    .filter(Boolean))];
}

(async () => {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`EGO 기프트 목록 요청 실패: HTTP ${response.status}`);
  const data = await response.json();
  const packsByGiftId = Object.fromEntries((data.items || [])
    .map(gift => [String(gift.egogiftId), normalizePackNames(gift.limitedCategoryNames)])
    .sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(OUT_PATH, JSON.stringify(packsByGiftId, null, 2) + '\n', 'utf8');
  const limitedCount = Object.values(packsByGiftId).filter(names => names.length).length;
  console.log(`✓ EGO 기프트 팩 정보 ${Object.keys(packsByGiftId).length}개 저장 완료 (팩 한정 ${limitedCount}개)`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
