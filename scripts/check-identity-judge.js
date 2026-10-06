const assert = require('node:assert/strict');
const { judgeCell } = require('../identity-judge-core');

const lcdIshmael = {
  수감자: '이스마엘',
  인격명: 'LCD 현장추리팀 이스마엘',
  성급: '★★★',
  소속1: '림버스 컴퍼니',
  소속2: 'LCD',
  소속3: '검계',
  키워드1: '출혈',
  키워드2: '호흡',
  키워드3: '',
};

function verdict(field, value) {
  return judgeCell(field, { [field]: value }, lcdIshmael).cls;
}

// 회귀 검사: 검계가 정답의 소속3에 있으므로 소속1에 제출해도 노랑이어야 한다.
assert.equal(verdict('소속1', '검계'), 'moved');
assert.equal(verdict('소속1', '림버스 컴퍼니'), 'hit');
assert.equal(verdict('소속2', '검계'), 'moved');
assert.equal(verdict('소속3', 'LCD'), 'moved');
assert.equal(verdict('소속1', '검지'), 'miss');
assert.equal(verdict('소속3', ''), 'miss');
assert.equal(judgeCell('소속3', { 소속3: '' }, { 소속3: '' }).cls, 'hit');

assert.equal(verdict('키워드1', '출혈'), 'hit');
assert.equal(verdict('키워드1', '호흡'), 'moved');
assert.equal(verdict('키워드2', '화상'), 'miss');
assert.equal(verdict('키워드3', ''), 'hit');

assert.equal(verdict('수감자', '이스마엘'), 'hit');
assert.equal(verdict('수감자', '싱클레어'), 'miss');

console.log('✓ 소속·키워드 위치별 초록/노랑/빨강 판정 검사 통과');
