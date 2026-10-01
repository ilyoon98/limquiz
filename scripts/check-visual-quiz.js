const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../visual-quiz-core');
const data = require('../visualQuizData.json');
const modes = ['character', 'boss', 'panic'];
const characterReview = require('../visualQuizCharacterReview.json');
assert.equal(data.character.length, characterReview.filter(row => !row.excluded).length);
for (const row of characterReview) {
  const actual = data.character.find(character => character.id === `character-${row.id}`);
  if (row.excluded) assert(!actual, `Excluded character remains: ${row.file}`);
  else {
    assert.equal(actual?.name, row.name);
    assert.equal(core.appearance(actual, 'character'), row.location);
    for (const alias of row.aliases) assert.equal(core.judge(actual, alias, data.character, []).type, 'correct');
  }
}
const bossReview = require('../visualQuizBossReview.json');
const includedBosses = bossReview.filter(row => !row.excluded);
assert.equal(data.boss.length, includedBosses.length, 'Every reviewed boss must be included');
for (const row of bossReview) {
  const actual = data.boss.find(boss => boss.id === `boss-${row.id}`);
  if (row.excluded) assert(!actual, `Excluded boss remains: ${row.file}`);
  else assert.equal(actual?.name, row.name, `Reviewed name mismatch: ${row.file}`);
}
for (const mode of modes) {
  const rows = data[mode];
  assert(rows.length > 0);
  for (const row of rows) {
    assert(fs.existsSync(row.image), row.image);
    assert(core.accepts(row, row.name.replaceAll(' ', '')));
    assert(!row.hints.some(h => /<[^>]*>/.test(h.text)), 'Raw markup in hints');
  }
  for (const chapter of [0,1,6,10]) assert(core.poolFor(rows, chapter).every(x => x.chapter <= chapter));
  assert.equal(core.poolFor(rows, 99).length, rows.length);
  const sample = rows[0];
  assert.equal(core.judge(sample, sample.name, rows, []).type, 'correct');
  assert.equal(core.judge(sample, '   ', rows, []).type, 'empty');
  assert.equal(core.judge(sample, '존재하지않는이름1234', rows, []).type, 'unknown');
  const wrong = rows.find(x => !core.accepts(sample, x.name));
  assert.equal(core.judge(sample, wrong.name, rows, []).type, 'wrong');
  assert.equal(core.judge(sample, wrong.name, rows, [wrong.name]).type, 'duplicate');
  let bag = [], prev, seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const next = core.nextId(rows, bag, prev);
    assert(!seen.has(next.id), 'Repeated before exhausting pool');
    seen.add(next.id); bag = next.bag; prev = next.id;
  }
  assert.notEqual(core.nextId(rows, bag, prev).id, prev, 'Immediate repeat at cycle boundary');
  const state = { id: sample.id, chapter: 99, roundId: 'test', status: 'playing', guesses: [wrong.name], hints: 0, bag: [wrong.id] };
  assert.deepEqual(core.restore(state, rows), { ...state, locationHint: false, nameHint: 0 });
  assert.equal(core.restore({ ...state, nameHint: 2 }, rows).nameHint, 2);
  assert.equal(core.restore({ ...state, nameHint: -1 }, rows), null);
  assert.equal(core.restore({ ...state, nameHint: 1000 }, rows), null);
  const migrated = core.restore({ ...state, chapter: 1 }, rows);
  assert.equal(migrated.chapter, 99);
  assert.equal(migrated.id, state.id);
  assert.deepEqual(migrated.bag, []);
  assert.equal(core.hintCount({ hints: 2, locationHint: true }), 3);
  assert.equal(core.restore({ ...state, locationHint: true }, rows).locationHint, true);
  assert.equal(core.restore({ ...state, locationHint: 'yes' }, rows), null);
  assert.equal(core.restore({ ...state, hints: 1000 }, rows), null);
  assert.equal(core.restore({ ...state, guesses: {} }, rows), null);
  assert.equal(core.nextId([sample], [], sample.id).id, sample.id);
}
const variants = [{ name: '개화 E.G.O::마름', aliases: ['마름'], id: 'a' }];
assert.equal(core.nameClue('이스마엘', 1).text, '4글자 · 공백·기호 제외');
assert.equal(core.nameClue('이스마엘', 2).text, '이●●●');
assert.equal(core.nameClue('이스마엘', 3).text, '이스●●');
assert.equal(core.nameClue('이스마엘', 5).text, '이스마엘');
assert.equal(core.nameClue('A B-가', 2).text, 'A ●-●');
assert.equal(core.nameClue('가', 2).text, '가');
assert.equal(core.hintCount({hints: 0, locationHint: false, nameHint: 3}), 3);
assert(core.accepts(variants[0], '개화 ego 마름'));
assert(core.accepts(variants[0], '마름'));
for (const file of ['visual-quiz.js','visual-quiz-core.js','visualQuizData.js']) new vm.Script(fs.readFileSync(file,'utf8'));
const html = fs.readFileSync('index.html','utf8');
for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
for (const mode of modes) assert(html.includes(`visual-quiz.html?mode=${mode}`));
assert.equal(core.appearance({chapter:6}, 'character'), '메인 스토리 · 제6장');
assert.equal(core.appearance({chapter:11}, 'boss'), '거울 던전');
assert.equal(core.appearance({chapter:11}, 'panic'), '');
assert(!fs.readFileSync('visual-quiz.html','utf8').includes('id="chapter"'));
console.log('✓ 정답·별칭·등장 위치 힌트·중복 출제·기존 세션 이전·복원 검사 통과');
