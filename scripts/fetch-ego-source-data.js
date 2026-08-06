// 일회성 데이터 수집 스크립트. baslimbus.info(EGO)와 limbus.haneuk.info(EGO 기프트)의
// 공개 API에서 데이터를 가져와 아이콘을 로컬에 저장하고 CharacterTable.xlsx의
// EGOData/EGOGiftData 시트를 채운다. 빌드 파이프라인의 일부가 아니라 필요할 때
// 수동으로 재실행하는 스크립트다.
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'CharacterTable.xlsx');
const EGO_IMG_DIR = path.join(ROOT, 'images', 'ego');
const GIFT_IMG_DIR = path.join(ROOT, 'images', 'ego-gifts');

fs.mkdirSync(EGO_IMG_DIR, { recursive: true });
fs.mkdirSync(GIFT_IMG_DIR, { recursive: true });

const ATTR_MAP = { 9: '분노', 10: '색욕', 11: '나태', 12: '탐식', 13: '우울', 14: '오만', 15: '질투' };
const TIER_MAP = { '1': 'Ⅰ', '2': 'Ⅱ', '3': 'Ⅲ', '4': 'Ⅳ', '5': 'Ⅴ', 'EX': 'EX' };

function stripMarkup(s) {
  if (!s) return '';
  return s.replace(/\{[a-zA-Z]+:([^}]*)\}/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1').trim();
}

// 이름 뒤에 붙는 한자/부제 표기(예: "착영휘도 [着影揮刀]")를 제거해 두 사이트 간
// EGO 이름 표기 차이를 흡수한다. 매칭 키로만 쓰고 실제 저장값에는 사용하지 않는다.
function normEgoName(s) {
  return s.replace(/\s*[\[\(（【].*$/, '').replace(/\s+/g, '').trim();
}

// baslimbus.info의 EGO 목록에는 EGO 실행에 필요한 죄악속성별 코인 구성(자원)이
// 없어서, limbusdeck.com의 서버 렌더링된 도감 HTML에서 별도로 긁어와 매칭한다.
// limbusdeck.com은 REST API가 없고 Next.js 서버 컴포넌트로 HTML에 데이터를 직접
// 렌더링하므로 정규식으로 파싱한다.
// 매칭은 (수감자, 원본 이름) 정확 일치를 우선하고, 실패하면 (수감자, 괄호 표기
// 제거한 이름)으로 폴백한다. 정확 일치를 우선하는 이유: "적안"과 "적안(開)"처럼
// 괄호가 실제로 다른 EGO를 구분하는 경우가 있어, 무조건 괄호를 지우고 매칭하면
// 서로 다른 EGO의 자원 데이터가 뒤섞인다. "착영휘도"/"착영휘도 [着影揮刀]"처럼
// baslimbus가 한자 부제를 아예 생략하는 경우에만 정규화 매칭으로 보완한다.
async function fetchEgoResourceCosts() {
  const r = await fetch('https://limbusdeck.com/ko/database/egos');
  const html = await r.text();
  const cardRe = /href="\/ko\/database\/egos\/([^"]+)"[\s\S]*?<\/a>/g;
  const exactMap = new Map();
  const normGroups = new Map(); // key -> [{name, costs}]
  for (const m of html.matchAll(cardRe)) {
    const block = m[0];
    const sinner = block.match(/<span class="text-xs text-muted-foreground">([^<]+)<\/span>/)?.[1];
    const title = block.match(/data-slot="card-title"[^>]*>([^<]+)<\/div>/)?.[1];
    const costs = [...block.matchAll(/text-\[10px\] font-medium" style="color:[^"]*">([^<]+)<!-- --> x<!-- -->([^<]+)<\/span>/g)]
      .map(c => `${c[1]} x${c[2]}`);
    if (!sinner || !title || !costs.length) continue;
    let name = title;
    if (title.endsWith(' ' + sinner)) name = title.slice(0, title.length - sinner.length - 1);
    const costStr = costs.join(', ');
    exactMap.set(`${sinner}::${name}`, costStr);
    const normKey = `${sinner}::${normEgoName(name)}`;
    if (!normGroups.has(normKey)) normGroups.set(normKey, []);
    normGroups.get(normKey).push({ name, costStr });
  }
  console.log(`limbusdeck.com EGO 자원(코인 구성) 목록: ${exactMap.size}개`);
  return { exactMap, normGroups };
}

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return true;
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (e) {
    console.warn('⚠ 이미지 다운로드 실패:', url, e.message);
    return false;
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function fetchEgos() {
  const r = await fetch('https://baslimbus.info/api/dictionary/paginated/new/ego?minWeight=1&maxWeight=7&size=500&page=0&type=and');
  const j = await r.json();
  console.log(`baslimbus.info EGO 목록: ${j.list.length}개`);
  const { exactMap, normGroups } = await fetchEgoResourceCosts();
  let missingResource = 0, ambiguousResource = 0;
  const rows = await mapWithConcurrency(j.list, 8, async ego => {
    const ext = path.extname(new URL(ego.image).pathname) || '.webp';
    const fname = `${ego.id}${ext}`;
    const ok = await downloadImage(ego.image, path.join(EGO_IMG_DIR, fname));
    let resource = exactMap.get(`${ego.character}::${ego.name}`) || '';
    if (!resource) {
      const group = normGroups.get(`${ego.character}::${normEgoName(ego.name)}`) || [];
      if (group.length === 1) resource = group[0].costStr;
      else if (group.length > 1) {
        ambiguousResource++;
        console.warn(`⚠ 자원 매칭 모호함 (동명이인 EGO): ${ego.character} "${ego.name}" — 후보: ${group.map(g => g.name).join(', ')}`);
      }
    }
    if (!resource) missingResource++;
    return {
      ID: ego.id,
      이름: ego.name,
      수감자: ego.character,
      등급: ego.grade,
      속성: (ego.resources && ego.resources[0]) || '',
      자원: resource,
      아이콘: ok ? `./images/ego/${fname}` : '',
    };
  });
  if (missingResource) console.warn(`⚠ 자원(코인 구성) 매칭 실패 ${missingResource}건${ambiguousResource ? ` (동명이인으로 인한 모호함 ${ambiguousResource}건 포함)` : ''}`);
  return rows;
}

async function fetchGifts() {
  const r = await fetch('https://limbus.haneuk.info/api/user/egogift?size=500&page=0');
  const j = await r.json();
  console.log(`limbus.haneuk.info EGO 기프트 목록: ${j.totalElements}개`);
  let detailFailCount = 0;
  const rows = await mapWithConcurrency(j.items, 8, async g => {
    let desc = '';
    try {
      const dr = await fetch(`https://limbus.haneuk.info/api/user/egogift/${g.egogiftId}`);
      if (dr.ok) {
        const dj = await dr.json();
        const eg = dj.egogift || {};
        desc = stripMarkup(eg.desc3 || eg.desc2 || eg.desc1 || '');
      } else {
        detailFailCount++;
      }
    } catch (e) {
      detailFailCount++;
      console.warn('⚠ 상세 조회 실패:', g.egogiftId, e.message);
    }
    const url = `https://limbus.haneuk.info${g.thumbnail}`;
    const ext = path.extname(g.thumbnail) || '.webp';
    const fname = `${g.egogiftId}${ext}`;
    const ok = await downloadImage(url, path.join(GIFT_IMG_DIR, fname));
    return {
      ID: g.egogiftId,
      이름: g.giftName,
      등급: TIER_MAP[g.giftTier] || g.giftTier,
      속성: ATTR_MAP[g.attrKeywordId] || '',
      효과: desc,
      아이콘: ok ? `./images/ego-gifts/${fname}` : '',
    };
  });
  if (detailFailCount) console.warn(`⚠ 효과 설명 조회 실패 ${detailFailCount}건 (효과 필드 비어있을 수 있음)`);
  return rows;
}

(async () => {
  console.log('EGO 데이터 수집 중...');
  const egoRows = await fetchEgos();
  console.log(`✓ EGO ${egoRows.length}개 수집 완료`);

  console.log('EGO 기프트 데이터 수집 중... (441개, 상세 조회 포함이라 시간이 걸립니다)');
  const giftRows = await fetchGifts();
  console.log(`✓ EGO 기프트 ${giftRows.length}개 수집 완료`);

  const wb = XLSX.readFile(XLSX_PATH);
  const EGO_HEADER = ['ID', '이름', '수감자', '등급', '속성', '자원', '아이콘'];
  const GIFT_HEADER = ['ID', '이름', '등급', '속성', '효과', '아이콘'];
  wb.Sheets['EGOData'] = XLSX.utils.json_to_sheet(egoRows, { header: EGO_HEADER });
  wb.Sheets['EGOGiftData'] = XLSX.utils.json_to_sheet(giftRows, { header: GIFT_HEADER });
  XLSX.writeFile(wb, XLSX_PATH);
  console.log('✓ CharacterTable.xlsx 저장 완료 (EGOData, EGOGiftData 시트 갱신)');
})();
