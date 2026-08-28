const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'egoGiftEnhanceable.json');
const SOURCE_URL = 'https://limbus.haneuk.info/api/user/egogift?size=500&page=0';

(async () => {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`EGO 기프트 목록 요청 실패: HTTP ${response.status}`);
  const data = await response.json();
  const ids = (data.items || [])
    .filter(gift => gift.enhanceYn === 'Y')
    .map(gift => String(gift.egogiftId))
    .sort((a, b) => Number(a) - Number(b));
  fs.writeFileSync(OUT_PATH, JSON.stringify(ids, null, 2) + '\n', 'utf8');
  console.log(`✓ 강화 가능한 EGO 기프트 ${ids.length}개 저장 완료`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
