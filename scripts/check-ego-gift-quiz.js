const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
function extract(name) {
  const start = source.lastIndexOf(`    function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const lineEnd = source.indexOf('\n', start);
  const end = source.slice(start, lineEnd).trimEnd().endsWith('}') ? lineEnd : source.indexOf('\n    }', start) + 6;
  return source.slice(start, end);
}
const names = ['gqGiftMetrics', 'gqHintDefs', 'gqGuessInfo', 'gqGuessRowHTML', 'gqEffectDiscoveries', 'gqEffectClueChunks', 'gqPickGift', 'gqSaveDailyState', 'gqTotalHints'];
const defsStart = source.indexOf('    const GQ_HINT_DEFS');
const defsEnd = source.indexOf('    function gqIsRandomMode', defsStart);
vm.runInNewContext(`
${source.slice(defsStart, defsEnd)}
const GQ_MAX_EFFECT_CLUES=6, GQ_DAILY_STORAGE_KEY='test';
let gqMode='daily',gqGift={ID:1,'이름':'기프트','등급':'IV','키워드':'출혈','조건속성':['분노'],'아이콘':'images/test.webp','효과':'출혈 효과.','전용팩':['한정 팩']};
const EGO_GIFTS=[gqGift];
let gqOpenedHints=new Set(),gqEffectRevealCount=0,gqGuessHistory=[{gift:gqGift}],gqNameDone=false,gqNameGaveUp=false,gqSubmitCount=0,gqHintsUsed=0,gqLastRecord=null,gqResultSaved=false,gqWrongGuesses=new Set();
let saved;const localStorage={setItem:(k,v)=>saved=JSON.parse(v)};
const getDailyDateKey=()=> '2026-10-01',getDailyAnswer=()=>EGO_GIFTS[0],gqLoadDailyState=()=>saved,gqFindTodayRecord=()=>null,sqNormName=s=>s,escapeHtml=s=>String(s);
${names.map(extract).join('\n')}
let dailyRow;
for (const mode of ['daily','random']) {
 gqMode=mode;
 assert.equal(gqHintDefs().map(x=>x.key).join(','),'grade,keyword,enhanceable,nameLength,affinities,packs,image');
 assert.equal(gqEffectClueChunks(gqGift['효과'],gqGift).join(''),'출혈 효과.');
 assert.equal(gqEffectDiscoveries().keyword,false);
 assert.equal(gqEffectDiscoveries().affinities.size,0);
 const row=gqGuessRowHTML({gift:gqGift},0);
 assert(row.includes('<img') && row.includes('TRY 1'));
 assert(!/eq-judge-cell (hit|miss)|정확히|불일치|↑|↓/.test(row));
 assert.equal(gqGuessInfo(gqGift).map(x=>x.label).join(','),'등급,키워드,강화 가능,이름 길이,조건 속성');
 if(mode==='daily')dailyRow=row;else assert.equal(row,dailyRow);
}
gqMode='daily';gqOpenedHints=new Set(['packs','keyword','affinities']);gqSaveDailyState(false);gqPickGift();
assert(gqOpenedHints.has('packs'));assert.equal(gqTotalHints(),3);assert.equal(gqGuessHistory.length,1);
assert.equal(gqGuessRowHTML(gqGuessHistory[0],0),dailyRow);
assert(gqEffectDiscoveries().keyword);assert(gqEffectDiscoveries().affinities.has('분노'));
`, {assert});
assert(!extract('gqRenderCard').includes('eq-wordle-legend'));
assert(!extract('gqRenderResult').includes('gqJudgeCode'));
assert(!extract('buildEgoGiftCardHTML').includes('deck-card-cell'));
vm.runInNewContext(`
let gqNameDone=false,gqNameGaveUp=false,gqMode='random',gqSubmitCount=6;
const gqGift={ID:99},wrongGift={ID:7},gqWrongGuesses=new Set(),gqGuessHistory=Array.from({length:6},()=>({gift:{}}));
const input={value:'다른 기프트',focus:()=>{}},hint={style:{}};
const document={getElementById:id=>id==='gq-name-inp'?input:id==='gq-name-hint'?hint:{},querySelectorAll:()=>[]};
const sqNormName=s=>s,gqFindGiftByName=()=>wrongGift,gqGuessBoardHTML=()=>'',gqRenderHintPanel=()=>{},gqRenderEffectClue=()=>{},gqEffectClueVisibleCount=()=>0,updateGqCardState=()=>{},animSlideIn=()=>{};
${extract('gqCheckName')}
gqCheckName();assert.equal(gqSubmitCount,7);assert.equal(gqNameDone,false);
`,{assert});
vm.runInNewContext(`
let gqSubmitCount=7,gqNameDone=false,gqMode='random',gqHintsUsed=0;
const gqOpenedHints=new Set(),gqTotalHints=()=>gqOpenedHints.size,gqHintDefs=()=>[{key:'image'}],managerGradeFor=cost=>cost>=9?'ZAYIN':'TETH',gqRenderHintPanel=()=>{},gqAnimateHintReveal=()=>{},document={querySelector:()=>null};
${extract('gqCanOpenImageHint')}
${extract('gqOpenHint')}
assert.equal(gqCanOpenImageHint(),false);gqOpenHint('image');assert.equal(gqOpenedHints.size,0);
gqSubmitCount=8;assert(gqCanOpenImageHint());gqOpenHint('image');assert(gqOpenedHints.has('image'));assert.equal(gqHintsUsed,1);
`,{assert});
const effectUI=extract('gqEffectClueHTML');
assert(effectUI.indexOf('{action}') < effectUI.indexOf('class="gq-clue-body"'));
assert(!effectUI.includes('아직 공개한 효과 기록'));
assert(!effectUI.includes('필요한 만큼 다음 기록'));
assert(!extract('gqRenderCard').includes('GIFT TRAINING'));
assert(!extract('gqRenderCard').includes('횟수 제한'));
assert(!extract('gqCheckName').includes('gqSubmitCount >='));
assert(!extract('gqRenderCard').includes('남은 기회'));
assert(!extract('gqGuessBoardHTML').includes('남은 추측'));
assert(extract('gqHintValueHTML').includes('gq-hint-image'));
console.log('PASS: daily/random hint order, separate packs, neutral TRY images, explicit effect hints, daily save/reload, share cards, script syntax');

// The two modes must render the same hints/effect controls for the same game state.
vm.runInNewContext(`
let gqMode='daily',gqSubmitCount=8,gqOpenedHints=new Set(),gqEffectRevealCount=0;
const gqGift={'이름':'예시','아이콘':'test.webp','효과':'첫 효과. 다음 효과.','키워드':'출혈','조건속성':[]};
const GQ_MAX_EFFECT_CLUES=6;
${source.slice(defsStart, defsEnd)}
const managerGradeFor=c=>c>=9?'ZAYIN':'TETH',escapeHtml=s=>String(s),kwChip=s=>s,sinChipHTML=s=>s,quizCostLedgerHTML=(tries,hints)=>tries+':'+hints,gqMaskedEffectHTML=s=>s;
${['gqGiftMetrics','gqHintDefs','gqTotalHints','gqCanOpenImageHint','gqHintValueHTML','gqHintPanelHTML','gqEffectClueChunks','gqEffectClueVisibleCount','gqEffectClueHTML'].map(extract).join('\n')}
for(const opened of [[],['keyword','packs'],['image']]) {
 gqOpenedHints=new Set(opened);
 for(const count of [0,1,2]) {
  gqEffectRevealCount=count;gqMode='daily';const daily=gqHintPanelHTML()+gqEffectClueHTML();
  gqMode='random';assert.equal(gqHintPanelHTML()+gqEffectClueHTML(),daily);
 }
}
`,{assert});
assert(extract('gqCheckName').includes('animSlideIn'));
assert(!extract('gqCheckName').includes('animWordleGuess'));
assert(extract('gqRenderResult').includes('if (celebrate)'));
console.log('PASS: identical daily/random hint and effect markup across reveal states; neutral TRY animation; celebration guard');

// Hint feedback works without anime, while respecting the site's motion toggle.
vm.runInNewContext(`
let enabled=true,finished;
const classes=new Set();const button={offsetWidth:100,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},removeEventListener:()=>{},addEventListener:(event,callback)=>finished=callback};
const document={querySelector:()=>button},motionEnabled=()=>enabled;
${extract('gqAnimateHintReveal')}
gqAnimateHintReveal('grade');assert(classes.has('gq-hint-revealing'));
finished({target:button});assert.equal(classes.size,0);
enabled=false;gqAnimateHintReveal('grade');assert.equal(classes.size,0);
`,{assert});
console.log('PASS: hint animation without external library, cleanup, motion-off preference');

vm.runInNewContext(`
let gqGift={ID:1,'이름':'정답'};
const gqGuessInfo=()=>[],escapeHtml=s=>String(s);
${extract('gqGuessRowHTML')}
assert(gqGuessRowHTML({gift:{ID:'1','이름':'정답'}},0).includes('gq-try-correct-badge'));
assert(!gqGuessRowHTML({gift:{ID:2,'이름':'오답'}},1).includes('gq-try-correct'));
`,{assert});
console.log('PASS: correct TRY highlighted, incorrect TRY neutral, restored string IDs supported');
