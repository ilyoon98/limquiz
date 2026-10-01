(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const accepts = (row, answer) => [row.name, ...row.aliases].some(name => normalize(name) === normalize(answer));
  const poolFor = (rows, chapter) => rows.filter(row => chapter === 99 || row.chapter <= chapter);
  function appearance(row, mode) {
    if (row.location) return row.location;
    if (mode === 'character' && row.chapter === 0) return 'LCB 수감자 일행';
    if (row.chapter >= 1 && row.chapter <= 10) return `메인 스토리 · 제${row.chapter}장`;
    if (mode === 'boss' && row.chapter === 11) return '거울 던전';
    return '';
  }
  const hintCount = state => state.hints + (state.locationHint ? 1 : 0) + (state.nameHint || 0);
  function nameClue(name, step) {
    const letters = [...name].filter(char => /[\p{L}\p{N}]/u.test(char));
    let index = 0;
    const masked = [...name].map(char => /[\p{L}\p{N}]/u.test(char) ? (++index <= step - 1 ? char : '●') : char).join('');
    return { length: letters.length, maxStep: letters.length + 1, text: step <= 1 ? `${letters.length}글자 · 공백·기호 제외` : masked };
  }
  function shuffled(ids, random = Math.random) {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function nextId(rows, bag, previous, random = Math.random) {
    const valid = new Set(rows.map(x => x.id));
    let remaining = [...new Set(bag)].filter(id => valid.has(id) && id !== previous);
    if (!remaining.length) remaining = shuffled([...valid].filter(id => rows.length === 1 || id !== previous), random);
    return { id: remaining[0], bag: remaining.slice(1) };
  }
  function judge(row, answer, pool, guesses) {
    const value = normalize(answer);
    if (!value) return { type: 'empty' };
    if (guesses.some(x => normalize(x) === value)) return { type: 'duplicate' };
    if (accepts(row, answer)) return { type: 'correct', answer: row.name };
    const candidate = pool.find(x => accepts(x, answer));
    return candidate ? { type: 'wrong', answer: candidate.name } : { type: 'unknown' };
  }
  function restore(value, rows) {
    if (!value) return null;
    const row = rows.find(x => x.id === value.id);
    if (!row || !Array.isArray(value.guesses) || !value.guesses.every(x => typeof x === 'string') || !Array.isArray(value.bag) || !value.bag.every(x => typeof x === 'string')) return null;
    if (!['playing', 'correct', 'wrong', 'revealed'].includes(value.status) || typeof value.roundId !== 'string' || !Number.isInteger(value.hints) || value.hints < 0 || value.hints > row.hints.length) return null;
    if (value.locationHint !== undefined && typeof value.locationHint !== 'boolean') return null;
    if (value.nameHint !== undefined && (!Number.isInteger(value.nameHint) || value.nameHint < 0 || value.nameHint > nameClue(row.name, 0).maxStep)) return null;
    return { ...value, chapter: 99, bag: value.chapter === 99 ? value.bag : [], locationHint: value.locationHint || false, nameHint: value.nameHint || 0 };
  }
  const api = { normalize, accepts, poolFor, shuffled, nextId, judge, restore, appearance, hintCount, nameClue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VisualQuizCore = api;
})(typeof window === 'undefined' ? globalThis : window);
