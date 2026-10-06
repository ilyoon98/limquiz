(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IdentityJudge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AFFILIATION_FIELDS = ['소속1', '소속2', '소속3'];
  const KEYWORD_FIELDS = ['키워드1', '키워드2', '키워드3'];
  const JUDGE_LABEL = { hit: '일치', moved: '순서 다름', miss: '불일치' };

  function normalize(value) {
    return (value ?? '').toString().trim();
  }

  function valuesOf(row, fields) {
    return fields.map(field => normalize(row[field])).filter(Boolean);
  }

  function judgeOrderedCell(field, fields, guess, answer) {
    const guessValue = normalize(guess[field]);
    const answerAtPosition = normalize(answer[field]);
    if (!guessValue) return answerAtPosition ? 'miss' : 'hit';
    if (guessValue === answerAtPosition) return 'hit';
    return valuesOf(answer, fields).includes(guessValue) ? 'moved' : 'miss';
  }

  function judgeCell(field, guess, answer) {
    let cls;
    if (field.startsWith('소속')) cls = judgeOrderedCell(field, AFFILIATION_FIELDS, guess, answer);
    else if (field.startsWith('키워드')) cls = judgeOrderedCell(field, KEYWORD_FIELDS, guess, answer);
    else cls = normalize(guess[field]) === normalize(answer[field]) ? 'hit' : 'miss';
    return { cls, label: JUDGE_LABEL[cls] };
  }

  return { AFFILIATION_FIELDS, KEYWORD_FIELDS, JUDGE_LABEL, normalize, valuesOf, judgeOrderedCell, judgeCell };
});
