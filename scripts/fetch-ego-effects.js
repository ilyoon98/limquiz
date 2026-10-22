// 일회성 데이터 수집 스크립트. limbusdeck.com의 EGO 상세 페이지에서 각성 스킬 효과문을
// 긁어와 CharacterTable.xlsx의 EGOData 시트에 "효과" 열만 채운다. 다른 열과 다른 시트는
// 건드리지 않는다. limbusdeck.com은 REST API가 없고 서버 렌더링된 HTML만 제공하므로
// 정규식과 균형 잡힌 div 추출로 파싱한다. 빌드 파이프라인의 일부가 아니며 필요할 때
// 수동으로 재실행한다.
//
//   node scripts/fetch-ego-effects.js            # 효과가 비어 있는 EGO만 수집
//   node scripts/fetch-ego-effects.js --all      # 모든 EGO를 다시 수집
const XLSX = require('xlsx');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'CharacterTable.xlsx');
const SHEET = 'EGOData';
const LIST_URL = 'https://limbusdeck.com/ko/database/egos';
const DETAIL_URL = slug => `https://limbusdeck.com/ko/database/egos/${slug}`;
const EGO_HEADER = ['ID', '이름', '수감자', '등급', '속성', '자원', '효과', '아이콘'];
const refetchAll = process.argv.includes('--all');
const SINNERS = ['이상', '파우스트', '돈키호테', '료슈', '뫼르소', '홍루', '히스클리프', '이스마엘', '로쟈', '싱클레어', '오티스', '그레고르'];

function normEgoName(s) {
  return String(s || '').replace(/\s*[\[\(（【].*$/, '').replace(/\s+/g, '').trim();
}
function decodeEntities(s) {
  return s.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
// start 위치의 <div ...>부터 짝이 맞는 </div>까지 잘라낸다.
function balancedDiv(html, start) {
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}
function innerChildren(container) {
  const open = container.indexOf('>') + 1;
  const inner = container.slice(open, container.lastIndexOf('</div>'));
  const children = [];
  let i = 0;
  while ((i = inner.indexOf('<div', i)) >= 0) {
    const child = balancedDiv(inner, i);
    children.push(child);
    i += child.length;
  }
  return children;
}
function toLines(fragment) {
  // 원본 HTML의 줄바꿈과 공백은 의미가 없으므로 먼저 접고, <br>만 줄 구분으로 삼는다.
  const BR = "";
  const flat = fragment.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/\s+/g, " ").replace(/<br\s*\/?>/g, BR).replace(/<[^>]+>/g, "");
  return decodeEntities(flat).split(BR).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// 원본 사이트는 "나생 [羅生]"처럼 한자 부제가 붙은 키워드를 타이밍 태그로 오인해
// 부제 앞에서 줄을 나눈다. 한글이 없는 대괄호로 시작하는 줄은 앞 줄에 다시 붙인다.
function mergeSubtitleLines(lines) {
  return lines.reduce((acc, line) => {
    if (acc.length && /^\[[^\]가-힣]+\]/.test(line)) acc[acc.length - 1] += ' ' + line;
    else acc.push(line);
    return acc;
  }, []);
}

// 스킬 섹션(각성)에서 첫 번째 스킬 카드의 효과 목록만 뽑는다. 탭이 여러 개인 EGO
// (예: 구멍/부셰)는 첫 번째 탭만 사용한다. 코인별 효과는 "코인 N: " 접두사를 붙인다.
function parseAwakeningEffect(html) {
  const sectionStart = html.search(/<h2[^>]*>스킬<\/h2>/);
  if (sectionStart < 0) return '';
  const sectionEnd = html.search(/<h2[^>]*>침식 스킬<\/h2>/);
  const section = html.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : undefined);
  const listStart = section.indexOf('<div class="mt-2 space-y-1">');
  if (listStart < 0) return '';
  const container = balancedDiv(section, listStart);
  const lines = [];
  innerChildren(container).forEach(child => {
    const childLines = mergeSubtitleLines(toLines(child));
    if (!childLines.length) return;
    const coin = childLines[0].match(/^(\d+)\.\s*(.*)$/);
    if (coin) {
      childLines[0] = coin[2];
      childLines.forEach(line => lines.push(`코인 ${coin[1]}: ${line}`));
    } else {
      childLines.forEach(line => lines.push(line));
    }
  });
  return lines.join('\n');
}

async function fetchSlugMap() {
  const html = await (await fetch(LIST_URL)).text();
  const cardRe = /href="\/ko\/database\/egos\/([^"]+)"[\s\S]*?<\/a>/g;
  const exact = new Map(), norm = new Map();
  for (const m of html.matchAll(cardRe)) {
    const slug = m[1];
    // 카드 안 텍스트 노드를 순서대로 모아 수감자 이름 바로 다음 텍스트를 제목으로 본다.
    // (마크업 클래스에 의존하지 않도록 한다.)
    const texts = decodeEntities(m[0].replace(/<svg[\s\S]*?<\/svg>/g, '')).split(/<[^>]+>/).map(t => t.trim()).filter(Boolean);
    const sinnerIdx = texts.findIndex(t => SINNERS.includes(t));
    if (sinnerIdx < 0 || !texts[sinnerIdx + 1]) continue;
    const sinner = texts[sinnerIdx], title = texts[sinnerIdx + 1];
    const name = title.endsWith(" " + sinner) ? title.slice(0, title.length - sinner.length - 1) : title;
    exact.set(`${sinner}::${name}`, slug);
    const key = `${sinner}::${normEgoName(name)}`;
    if (!norm.has(key)) norm.set(key, []);
    norm.get(key).push(slug);
  }
  console.log(`limbusdeck.com EGO 목록: ${exact.size}개`);
  return { exact, norm };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() { while (idx < items.length) { const i = idx++; results[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

(async () => {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) { console.error(`✗ ${SHEET} 시트가 없습니다.`); process.exit(1); }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const { exact, norm } = await fetchSlugMap();
  const targets = rows.filter(row => row['ID'] !== '' && (refetchAll || !String(row['효과'] || '').trim()));
  console.log(`효과 수집 대상: ${targets.length}개 / 전체 ${rows.length}개`);
  let missing = 0, failed = 0, empty = 0;
  await mapWithConcurrency(targets, 4, async row => {
    const sinner = String(row['수감자']).trim(), name = String(row['이름']).trim();
    let slug = exact.get(`${sinner}::${name}`);
    if (!slug) {
      const group = norm.get(`${sinner}::${normEgoName(name)}`) || [];
      if (group.length === 1) slug = group[0];
    }
    if (!slug) { missing++; console.warn(`⚠ limbusdeck 매칭 실패: ${sinner} "${name}"`); return; }
    try {
      const r = await fetch(DETAIL_URL(slug));
      if (!r.ok) { failed++; console.warn(`⚠ 상세 조회 실패 (${r.status}): ${slug}`); return; }
      const effect = parseAwakeningEffect(await r.text());
      if (!effect) { empty++; console.warn(`⚠ 효과 파싱 결과 없음: ${slug}`); return; }
      row['효과'] = effect;
    } catch (e) { failed++; console.warn(`⚠ 상세 조회 오류: ${slug}`, e.message); }
  });
  const header = [...EGO_HEADER, ...Object.keys(rows[0] || {}).filter(k => !EGO_HEADER.includes(k))];
  wb.Sheets[SHEET] = XLSX.utils.json_to_sheet(rows, { header });
  XLSX.writeFile(wb, XLSX_PATH, { compression: true });
  const filled = rows.filter(row => String(row['효과'] || '').trim()).length;
  console.log(`✓ CharacterTable.xlsx 저장 완료 (${SHEET} 효과 ${filled}/${rows.length}개${missing ? `, 매칭 실패 ${missing}` : ''}${failed ? `, 조회 실패 ${failed}` : ''}${empty ? `, 파싱 실패 ${empty}` : ''})`);
})();
