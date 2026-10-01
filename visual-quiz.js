(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const configs = {
    character: { title: '인물 퀴즈', description: '관리자님, 초상화 속 인물을 식별해 주십시오. 필요하면 등장 기록을 열람할 수 있습니다.', question: '이 인물의 이름은?', label: 'LCB · 인물 식별 자료' },
    boss: { title: '보스 아이콘 퀴즈', description: '교전 기록에 남은 문양입니다. 해당 보스·환상체의 이름을 보고해 주십시오.', question: '이 아이콘의 주인은?', label: 'LCB · 교전 대상 식별 자료' },
    panic: { title: '패닉 유형 퀴즈', description: '정신 상태 관찰 기록입니다. 아이콘과 필요에 따라 열람한 효과를 토대로 패닉 유형을 식별해 주십시오.', question: '이 패닉 유형의 이름은?', label: 'LCB · 정신 상태 관찰 자료 · 고난도' }
  };
  const requested = new URLSearchParams(location.search).get('mode');
  const mode = Object.hasOwn(configs, requested) ? requested : 'character';
  const config = configs[mode];
  const data = window.LIMQUIZ_VISUAL_DATA;
  const core = window.VisualQuizCore;
  $('title').textContent = config.title;
  $('description').textContent = config.description;
  document.title = `${config.title} · 림퀴즈`;
  document.querySelector(`[data-mode="${mode}"]`).setAttribute('aria-current', 'page');
  if (!core || !data || !Array.isArray(data[mode]) || !data[mode].length) {
    $('dataError').hidden = false;
    $('dataError').textContent = '문제 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
    return;
  }
  const rows = data[mode];
  let motion = true;
  try { motion = localStorage.getItem('limbus_motion_pref') !== 'off'; } catch {}
  function motionUI() {
    document.documentElement.classList.toggle('reduce-motion', !motion);
    $('motionToggle').textContent = motion ? '연출 켜짐' : '연출 꺼짐';
    $('motionToggle').setAttribute('aria-pressed', String(motion));
  }
  function animate(element, kind = 'rise') {
    if (!motion || !element || !element.animate) return;
    const frames = kind === 'hint'
      ? [{ backgroundColor: '#59472c', boxShadow: 'inset 0 0 0 2px #ffe2a2' }, { backgroundColor: '#2b2720', boxShadow: 'inset 0 0 0 0 transparent' }]
      : kind === 'success'
        ? [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }]
        : [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }];
    element.animate(frames, { duration: kind === 'hint' ? 650 : 380, easing: 'ease-out' });
  }
  $('motionToggle').addEventListener('click', () => {
    motion = !motion;
    try { localStorage.setItem('limbus_motion_pref', motion ? 'on' : 'off'); } catch {}
    if (!motion) document.getAnimations().forEach(animation => animation.cancel());
    motionUI();
  });
  motionUI();
  const sessionKey = `limquiz_visual_session_v1_${mode}`;
  const resultKey = 'limbus_results_v2';
  let memoryRecords = [], storageFailed = false, imageReady = false, imageToken = 0;
  function read(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }
  const loadedRecords = read(resultKey, []);
  memoryRecords = Array.isArray(loadedRecords) ? loadedRecords : [];
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { storageFailed = true; $('storageNotice').hidden = false; }
  }
  let state = core.restore(read(sessionKey, null), rows);
  const pool = rows;
  const current = () => rows.find(row => row.id === state?.id);
  const totalHints = () => core.hintCount(state);
  function stats() {
    const records = storageFailed ? memoryRecords : read(resultKey, memoryRecords);
    const list = (Array.isArray(records) ? records : []).filter(r => r?.mode === mode);
    $('played').textContent = list.length;
    $('solved').textContent = list.filter(r => r.success).length;
    $('unassisted').textContent = list.filter(r => r.success && !r.hints).length;
  }
  function persist() { write(sessionKey, state); }
  function saveResult() {
    let records = storageFailed ? memoryRecords : read(resultKey, memoryRecords);
    if (!Array.isArray(records)) records = [];
    if (records.some(r => r?.roundId === state.roundId)) return;
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    records.push({ mode, roundId: state.roundId, date, success: state.status === 'correct', gaveUp: state.status === 'revealed', tries: state.guesses.length, hints: totalHints(), locationHint: state.locationHint, answerName: current().name, answerId: current().id, chapter: state.chapter });
    memoryRecords = records;
    write(resultKey, records);
    stats();
  }
  function controls() {
    const playing = state?.status === 'playing';
    $('locationHint').disabled = !imageReady || !playing || state.locationHint || !core.appearance(current(), mode);
    $('answer').disabled = $('submit').disabled = $('reveal').disabled = !imageReady || !playing;
    $('hint').disabled = !imageReady || !playing || state.hints >= current().hints.length;
  }
  function loadImage() {
    const token = ++imageToken;
    imageReady = false;
    $('questionImage').hidden = true;
    $('imageStatus').hidden = false;
    $('imageStatus').textContent = '이미지를 불러오고 있습니다.';
    $('retryImage').hidden = $('skipImage').hidden = true;
    controls();
    const img = new Image();
    img.onload = () => {
      if (token !== imageToken) return;
      $('questionImage').src = img.src;
      $('questionImage').hidden = false;
      $('imageStatus').hidden = true;
      imageReady = true;
      controls();
      if (state.status === 'playing') $('answer').focus({ preventScroll: true });
      animate($('questionImage'));
    };
    img.onerror = () => {
      if (token !== imageToken) return;
      $('imageStatus').textContent = '이미지를 불러오지 못했습니다. 다시 불러오거나 다른 문제를 골라주세요.';
      $('retryImage').hidden = $('skipImage').hidden = false;
    };
    img.src = current().image;
  }
  function hints() {
    $('hintArea').hidden = mode !== 'panic';
    $('hints').replaceChildren();
    current().hints.forEach((hint, index) => {
      const paragraph = document.createElement('p'), title = document.createElement('strong');
      const opened = state.status !== 'playing' || index < state.hints;
      paragraph.className = opened ? 'clue-line revealed' : 'clue-line locked';
      title.textContent = `CLUE ${String(index + 1).padStart(2, '0')} · ${hint.label}`;
      // The effect can contain the answer's own name; hide that name until the round ends.
      let text = hint.text;
      if (state.status === 'playing') for (const name of [current().name, ...current().aliases]) if (name) text = text.split(name).join('???');
      paragraph.append(title, document.createTextNode(opened ? text : '효과를 열람하면 내용이 공개됩니다.'));
      $('hints').append(paragraph);
    });
    $('hint').hidden = state.status !== 'playing';
    $('hint').textContent = state.hints >= current().hints.length ? '열람 완료' : `효과 열람 +1 · ${state.hints}/${current().hints.length}`;
  }
  function render() {
    $('game').hidden = false;
    $('archiveCount').textContent = `${rows.length}개 기록 수록`;
    const location = core.appearance(current(), mode);
    const showLocation = !!location && (state.locationHint || state.status !== 'playing');
    $('locationText').textContent = showLocation ? location : !location ? '등장 위치 미확인' : '열람 +1';
    $('locationHint').classList.toggle('revealed', showLocation);
    $('questionLabel').textContent = config.label;
    $('questionTitle').textContent = config.question;
    $('cost').textContent = `현재 비용 ${state.guesses.length + totalHints()}`;
    $('attempts').textContent = `추측 ${state.guesses.length} + 힌트 ${totalHints()}`;
    $('guessCount').textContent = state.guesses.length;
    $('guesses').replaceChildren();
    state.guesses.forEach((guess, i) => {
      const li = document.createElement('li');
      const correct = state.status === 'correct' && i === state.guesses.length - 1;
      li.className = `try-card${correct ? ' correct' : ''}`;
      const candidate = pool.find(row => row.name === guess);
      const img = document.createElement('img');
      img.alt = ''; if (candidate) img.src = candidate.image; else img.hidden = true;
      const content = document.createElement('div'), label = document.createElement('span'), name = document.createElement('strong');
      label.textContent = `TRY ${String(i + 1).padStart(2, '0')} · ${correct ? '식별 성공' : '불일치'}`;
      name.textContent = guess;
      content.append(label, name); li.append(img, content);
      $('guesses').prepend(li);
    });
    if (!state.guesses.length) { const empty = document.createElement('li'); empty.className = 'history-empty'; empty.textContent = '제출한 추측이 이곳에 기록됩니다.'; $('guesses').append(empty); }
    const finished = state.status !== 'playing';
    $('answerForm').hidden = finished;
    $('playingActions').hidden = finished;
    $('result').hidden = !finished;
    if (finished) {
      closeSearch();
      $('result').classList.toggle('success', state.status === 'correct');
      $('resultBadge').textContent = state.status === 'correct' ? '식별 성공 · IDENTIFIED' : '정답 확인 · RECORD OPENED';
      $('resultName').textContent = current().name;
      $('resultDetail').textContent = state.status === 'correct' ? `${state.guesses.length}번 만에 맞혔습니다.${totalHints() ? ` 힌트 ${totalHints()}개 사용` : ' 힌트 없이 정답!'}` : '정답을 확인했습니다. 다음 문제에 도전해보세요.';
    }
    hints(); controls();
  }
  function next() {
    if (!pool.length) return;
    const wasPlaying = !!state;
    const picked = core.nextId(pool, state?.bag || [], state?.id);
    state = { id: picked.id, bag: picked.bag, chapter: 99, guesses: [], hints: 0, locationHint: false, status: 'playing', roundId: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    $('answer').value = '';
    $('feedback').textContent = '';
    closeSearch(); persist(); render(); loadImage();
    animate(document.querySelector('.answer-panel'));
    $('questionTitle').focus({ preventScroll: true });
    if (wasPlaying) $('game').scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'start' });
  }
  function showResult() {
    $('next').focus({ preventScroll: true });
    $('result').scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'nearest' });
  }
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let matches = [], activeOption = -1;
  function closeSearch() {
    $('answerNames').hidden = true;
    $('answer').setAttribute('aria-expanded', 'false');
    $('answer').removeAttribute('aria-activedescendant');
    activeOption = -1;
  }
  function choose(index) {
    if (!matches[index]) return;
    $('answer').value = matches[index].name;
    closeSearch(); $('answer').focus({ preventScroll: true });
  }
  function search() {
    const query = normalize($('answer').value);
    matches = [...new Map(pool.map(row => [row.name, row])).values()]
      .filter(row => !state.guesses.includes(row.name) && [row.name, ...row.aliases].some(name => normalize(name).includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    activeOption = -1;
    $('answer').removeAttribute('aria-activedescendant');
    $('answerNames').replaceChildren();
    matches.forEach((row, index) => {
      const option = document.createElement('li');
      option.id = `answer-option-${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      option.textContent = row.name;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => choose(index));
      $('answerNames').append(option);
    });
    if (!matches.length) { const empty = document.createElement('li'); empty.className = 'search-empty'; empty.setAttribute('role', 'presentation'); empty.textContent = '일치하는 이름이 없습니다.'; $('answerNames').append(empty); }
    $('answerNames').hidden = false;
    $('answer').setAttribute('aria-expanded', 'true');
  }
  $('answer').addEventListener('input', search);
  $('answer').addEventListener('click', search);
  $('answer').addEventListener('blur', closeSearch);
  $('answer').addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) { if (event.key === 'Enter') event.preventDefault(); return; }
    if (event.key === 'Escape') { closeSearch(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if ($('answerNames').hidden) search();
      if (!matches.length) return;
      activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      [...$('answerNames').children].forEach((option, index) => option.setAttribute('aria-selected', String(index === activeOption)));
      const option = $('answerNames').children[activeOption];
      $('answer').setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !$('answerNames').hidden && activeOption >= 0) { event.preventDefault(); choose(activeOption); }
  });
  $('answerForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!imageReady || state.status !== 'playing') return;
    const result = core.judge(current(), $('answer').value, pool, state.guesses);
    const messages = { empty: '이름을 입력해 주세요.', unknown: '등록된 이름을 입력하거나 검색 목록에서 골라주세요.', duplicate: '이미 추측한 이름입니다.', wrong: '다른 이름을 떠올려보세요.', correct: '정답입니다!' };
    $('feedback').textContent = messages[result.type];
    if (!['wrong', 'correct'].includes(result.type)) return;
    // An English alias of an already submitted wrong answer is also a duplicate.
    if (result.type === 'wrong' && state.guesses.includes(result.answer)) { $('feedback').textContent = messages.duplicate; return; }
    state.guesses.push(result.answer);
    if (result.type === 'correct') state.status = 'correct';
    closeSearch(); persist(); render(); animate($('guesses').firstElementChild);
    if (state.status === 'correct') { saveResult(); animate($('result'), 'success'); showResult(); }
    else { $('answer').value = ''; $('answer').focus({ preventScroll: true }); }
  });
  $('reveal').addEventListener('click', () => {
    if (!imageReady || state.status !== 'playing') return;
    state.status = 'revealed'; persist(); render(); saveResult();
    $('feedback').textContent = '정답 공개';
    animate($('result'));
    showResult();
  });
  $('hint').addEventListener('click', () => {
    if (!imageReady || state.status !== 'playing' || state.hints >= current().hints.length) return;
    state.hints++; persist(); render(); animate($('hints').children[state.hints - 1], 'hint');
    if ($('hint').disabled) $('answer').focus({ preventScroll: true });
  });
  $('next').addEventListener('click', () => next());
  $('retryImage').addEventListener('click', loadImage);
  $('skipImage').addEventListener('click', () => next());
  $('locationHint').addEventListener('click', () => {
    if (!imageReady || state.status !== 'playing' || state.locationHint || !core.appearance(current(), mode)) return;
    state.locationHint = true; persist(); render(); animate($('locationHint'), 'hint');
    $('answer').focus({ preventScroll: true });
  });
  stats();
  // Migrate an old scoped session without losing the question or effect hints.
  if (state) { persist(); render(); loadImage(); }
  else next();
})();
