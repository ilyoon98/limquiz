(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const configs = {
    character: { title: '인물 퀴즈', description: '관리자님, 초상화 속 인물을 식별해 주십시오. 제출 기회는 한 번입니다.', question: '이 인물의 이름은?', label: 'LCB · 인물 식별 자료' },
    boss: { title: '보스 아이콘 퀴즈', description: '교전 기록에 남은 문양입니다. 해당 보스·환상체의 이름을 보고해 주십시오.', question: '이 아이콘의 주인은?', label: 'LCB · 교전 대상 식별 자료' },
    panic: { title: '패닉 유형 퀴즈', description: '정신 상태 관찰 기록입니다. 아이콘을 보고 패닉 유형을 식별해 주십시오.', question: '이 패닉 유형의 이름은?', label: 'LCB · 정신 상태 관찰 자료 · 고난도' }
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
  const sessionKey = `limquiz_visual_session_v2_${mode}`;
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
  const historyKey = `limquiz_visual_history_v1_${mode}`;
  let sessionHistory = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(historyKey) || '[]');
    if (Array.isArray(saved)) sessionHistory = saved.filter(entry =>
      entry && typeof entry.roundId === 'string' && typeof entry.name === 'string' &&
      rows.some(row => row.id === entry.id) && typeof entry.success === 'boolean' &&
      Array.isArray(entry.guesses) && entry.guesses.every(guess => typeof guess === 'string') &&
      Number.isInteger(entry.hints) && entry.hints >= 0);
  } catch { $('sessionHistoryNotice').hidden = false; }
  function renderSessionHistory() {
    $('sessionHistoryCount').textContent = `${sessionHistory.length}문제 · 정답 ${sessionHistory.filter(entry => entry.success).length}`;
    $('sessionHistoryEmpty').hidden = sessionHistory.length > 0;
    const list = $('sessionHistoryList');
    list.replaceChildren();
    sessionHistory.slice().reverse().forEach((entry, index) => {
      const card = document.createElement('article');
      card.className = 'try-card session-entry ' + (entry.success ? 'correct' : 'incorrect');
      const img = document.createElement('img');
      img.src = rows.find(row => row.id === entry.id).image; img.alt = ''; img.loading = 'lazy';
      const info = document.createElement('div'), label = document.createElement('span'), name = document.createElement('strong');
      label.textContent = '문제 ' + (sessionHistory.length - index) + ' · ' + (entry.success ? '정답' : '오답');
      name.textContent = entry.name;
      info.append(label, name); card.append(img, info); list.append(card);
    });
  }
  function saveSessionHistory() {
    if (sessionHistory.some(entry => entry.roundId === state.roundId)) return;
    sessionHistory.push({ roundId: state.roundId, id: current().id, name: current().name,
      success: state.status === 'correct', guesses: [...state.guesses], hints: totalHints() });
    try { sessionStorage.setItem(historyKey, JSON.stringify(sessionHistory)); }
    catch { $('sessionHistoryNotice').hidden = false; }
    renderSessionHistory();
  }
  function stats() {
    const records = storageFailed ? memoryRecords : read(resultKey, memoryRecords);
    const list = (Array.isArray(records) ? records : []).filter(r => r?.mode === mode);
    $('played').textContent = list.reduce((sum, r) => sum + (r.recordType === 'visual-session' ? r.total : 1), 0);
    $('solved').textContent = list.reduce((sum, r) => sum + (r.recordType === 'visual-session' ? r.solved : Number(r.success)), 0);
    $('missed').textContent = Number($('played').textContent) - Number($('solved').textContent);
  }
  function persist() { write(sessionKey, state); }
  function saveResult() {
    saveSessionHistory();
    let records = storageFailed ? memoryRecords : read(resultKey, memoryRecords);
    if (!Array.isArray(records)) records = [];
    const sessionId = 'visual-session-' + sessionHistory[0].roundId;
    const previous = records.find(r => r?.roundId === sessionId);
    const roundIds = new Set(sessionHistory.map(entry => entry.roundId));
    // Replace this session's old per-question records without touching other modes or sessions.
    records = records.filter(r => !(r?.mode === mode && (r.roundId === sessionId || roundIds.has(r.roundId))));
    const d = new Date();
    const date = previous?.date || [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
    const solved = sessionHistory.filter(entry => entry.success).length;
    records.push({ mode, recordType: 'visual-session', roundId: sessionId, date,
      total: sessionHistory.length, solved, success: solved === sessionHistory.length,
      answerName: '세션 기록', updatedAt: d.toISOString() });
    memoryRecords = records;
    write(resultKey, records);
    stats();
  }
  function controls() {
    const playing = state?.status === 'playing';
    $('answer').disabled = $('submit').disabled = $('giveUp').disabled = !imageReady || !playing;
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
  function render() {
    $('game').hidden = false;
    $('archiveCount').textContent = `${rows.length}개 기록 수록`;
    $('questionLabel').textContent = config.label;
    $('questionTitle').textContent = config.question;
    const finished = state.status !== 'playing';
    $('answerForm').hidden = finished;
    $('playingActions').hidden = finished;
    $('result').hidden = !finished;
    if (finished) {
      $('result').classList.toggle('success', state.status === 'correct');
      $('resultBadge').textContent = state.status === 'correct' ? '정답 · IDENTIFIED' : '오답 · IDENTIFICATION FAILED';
      $('resultName').textContent = current().name;
      $('resultDetail').textContent = '정답을 확인한 뒤 Enter를 누르거나 다음 문제 버튼을 눌러주세요.';
    }
    controls();
  }
  function next() {
    if (!pool.length) return;
    const wasPlaying = !!state;
    const picked = core.nextId(pool, state?.bag || [], state?.id);
    state = { id: picked.id, bag: picked.bag, chapter: 99, guesses: [], hints: 0, nameHint: 0, locationHint: false, status: 'playing', roundId: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    $('answer').value = '';
    $('feedback').textContent = '';
    persist(); render();
    $('questionTitle').focus({ preventScroll: true });
    loadImage();
    animate(document.querySelector('.answer-panel'));
    if (wasPlaying) $('game').scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'start' });
  }
  function showResult() {
    $('next').focus({ preventScroll: true });
    $('result').scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'nearest' });
  }
  $('answer').addEventListener('keydown', event => {
    // Enter confirming Korean IME composition must not spend the only attempt.
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  $('answerForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!imageReady || state.status !== 'playing') return;
    const answer = $('answer').value.trim();
    if (!answer) { $('feedback').textContent = '이름을 입력해 주세요.'; return; }
    state.guesses = [answer];
    state.status = core.accepts(current(), answer) ? 'correct' : 'wrong';
    persist(); render(); saveResult();
    animate($('result'), state.status === 'correct' ? 'success' : 'rise');
    showResult();
  });
  $('giveUp').addEventListener('click', () => {
    if (!imageReady || state.status !== 'playing') return;
    state.status = 'revealed';
    persist(); render(); saveResult();
    animate($('result'));
    showResult();
  });
  $('next').addEventListener('click', () => next());
  $('retryImage').addEventListener('click', loadImage);
  $('skipImage').addEventListener('click', () => next());
  if (sessionHistory.length && state && sessionHistory.some(entry => entry.roundId === state.roundId)) saveResult();
  stats();
  renderSessionHistory();
  // One-attempt rounds use a separate key; existing cumulative records stay intact.
  if (state) { persist(); render(); loadImage(); }
  else next();
})();
