const SURAH_NAMES = [
  [1,'Al-Fatihah'],[2,'Al-Baqarah'],[3,'Ali Imran'],[4,'An-Nisa'],[5,'Al-Ma\'idah'],[6,'Al-An\'am'],[7,'Al-A\'raf'],[8,'Al-Anfal'],[9,'At-Taubah'],[10,'Yunus'],
  [11,'Hud'],[12,'Yusuf'],[13,'Ar-Ra\'d'],[14,'Ibrahim'],[15,'Al-Hijr'],[16,'An-Nahl'],[17,'Al-Isra'],[18,'Al-Kahf'],[19,'Maryam'],[20,'Taha'],
  [21,'Al-Anbiya'],[22,'Al-Hajj'],[23,'Al-Mu\'minun'],[24,'An-Nur'],[25,'Al-Furqan'],[26,'Ash-Shu\'ara'],[27,'An-Naml'],[28,'Al-Qasas'],[29,'Al-Ankabut'],[30,'Ar-Rum'],
  [31,'Luqman'],[32,'As-Sajdah'],[33,'Al-Ahzab'],[34,'Saba'],[35,'Fatir'],[36,'Ya-Sin'],[37,'As-Saffat'],[38,'Sad'],[39,'Az-Zumar'],[40,'Ghafir'],
  [41,'Fussilat'],[42,'Ash-Shura'],[43,'Az-Zukhruf'],[44,'Ad-Dukhan'],[45,'Al-Jathiyah'],[46,'Al-Ahqaf'],[47,'Muhammad'],[48,'Al-Fath'],[49,'Al-Hujurat'],[50,'Qaf'],
  [51,'Adh-Dhariyat'],[52,'At-Tur'],[53,'An-Najm'],[54,'Al-Qamar'],[55,'Ar-Rahman'],[56,'Al-Waqi\'ah'],[57,'Al-Hadid'],[58,'Al-Mujadilah'],[59,'Al-Hashr'],[60,'Al-Mumtahanah'],
  [61,'As-Saff'],[62,'Al-Jumu\'ah'],[63,'Al-Munafiqun'],[64,'At-Taghabun'],[65,'At-Talaq'],[66,'At-Tahrim'],[67,'Al-Mulk'],[68,'Al-Qalam'],[69,'Al-Haqqah'],[70,'Al-Ma\'arij'],
  [71,'Nuh'],[72,'Al-Jinn'],[73,'Al-Muzzammil'],[74,'Al-Muddaththir'],[75,'Al-Qiyamah'],[76,'Al-Insan'],[77,'Al-Mursalat'],[78,'An-Naba'],[79,'An-Nazi\'at'],[80,'Abasa'],
  [81,'At-Takwir'],[82,'Al-Infitar'],[83,'Al-Mutaffifin'],[84,'Al-Inshiqaq'],[85,'Al-Buruj'],[86,'At-Tariq'],[87,'Al-A\'la'],[88,'Al-Ghashiyah'],[89,'Al-Fajr'],[90,'Al-Balad'],
  [91,'Ash-Shams'],[92,'Al-Lail'],[93,'Ad-Duha'],[94,'Ash-Sharh'],[95,'At-Tin'],[96,'Al-Alaq'],[97,'Al-Qadr'],[98,'Al-Bayyinah'],[99,'Az-Zalzalah'],[100,'Al-Adiyat'],
  [101,'Al-Qari\'ah'],[102,'At-Takathur'],[103,'Al-Asr'],[104,'Al-Humazah'],[105,'Al-Fil'],[106,'Quraysh'],[107,'Al-Ma\'un'],[108,'Al-Kawthar'],[109,'Al-Kafirun'],[110,'An-Nasr'],
  [111,'Al-Masad'],[112,'Al-Ikhlas'],[113,'Al-Falaq'],[114,'An-Nas']
];

const STORAGE_KEY = 'mutqin-ai-state-v1';
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const DEFAULT_STATE = {
  settings: { name: '', dailyNew: 2, dailyMurajaah: 5, weeklyGoal: 10, dailyMinutes: 30, level: 'beginner', milestoneName: 'Juz 30 mutqin', targetDate: '' },
  selectedSurah: 67,
  activeAyah: 1,
  progress: {},
  submissions: [],
  streak: { last: null, count: 0 },
  chat: []
};

let state = loadState();
let surahData = { number: 67, name: 'Al-Mulk', ayahs: [] };
let currentAudio = null;
let mediaRecorder = null;
let chunks = [];
let lastAudioBlob = null;
let submitTargetVisible = false;
let lastDrillType = 'hide';
let liveRecognition = null;
let liveFinalText = '';
let liveInterimText = '';
let liveLastSpokenWarning = 0;
let liveLastMatchCount = 0;
let liveLastProgressAt = Date.now();
let liveStableMismatchStreak = 0;
let liveFocusMode = false;
let liveAudioContext = null;
let liveLastErrorCue = 0;
let liveSoundEnabled = true;
let liveRecovery = null;

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...structuredClone(DEFAULT_STATE), ...JSON.parse(saved) } : structuredClone(DEFAULT_STATE);
  } catch (err) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function progressKey(surah = state.selectedSurah, ayah = state.activeAyah) {
  return `${surah}:${ayah}`;
}

function getProgress(ayahNum = state.activeAyah) {
  const key = progressKey(state.selectedSurah, ayahNum);
  if (!state.progress[key]) {
    state.progress[key] = {
      status: 'new',
      strength: 0,
      reps: 0,
      mistakes: [],
      lastReviewed: null,
      nextReview: todayISO(),
      hintsUsed: 0,
      bestScore: 0
    };
  }
  return state.progress[key];
}

function setProgress(ayahNum, updates) {
  const p = getProgress(ayahNum);
  Object.assign(p, updates);
  saveState();
}

function init() {
  populateSurahSelect();
  bindNavigation();
  bindActions();
  loadSettingsIntoForm();
  loadSurah(state.selectedSurah);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  syncMobileUi();
}

function populateSurahSelect() {
  const select = $('surahSelect');
  select.innerHTML = SURAH_NAMES.map(([num, name]) => `<option value="${num}">${num}. ${name}</option>`).join('');
  select.value = state.selectedSurah;
}

async function loadSurah(number) {
  state.selectedSurah = Number(number);
  saveState();
  showLoading(true);
  showError('');
  try {
    const url = `https://api.alquran.cloud/v1/surah/${number}/editions/quran-uthmani,id.indonesian,ar.alafasy`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API tidak merespons dengan baik.');
    const json = await response.json();
    const [arabic, translation, audio] = json.data;
    const surahName = SURAH_NAMES.find(([num]) => num === Number(number))?.[1] || arabic.englishName || `Surah ${number}`;
    surahData = {
      number: Number(number),
      name: surahName,
      ayahs: arabic.ayahs.map((ayah, index) => ({
        numberInSurah: ayah.numberInSurah,
        globalNumber: ayah.number,
        text: ayah.text,
        translation: translation?.ayahs?.[index]?.text || '',
        audio: audio?.ayahs?.[index]?.audio || ''
      }))
    };
    if (!surahData.ayahs.find(a => a.numberInSurah === state.activeAyah)) state.activeAyah = 1;
    buildAyahSelectors();
    renderAll();
  } catch (err) {
    showError(`Gagal memuat data Qur'an. Cek koneksi internet, lalu klik Refresh. Detail: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  $('loading').classList.toggle('hidden', !show);
}
function showError(message) {
  const box = $('errorBox');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
}

function buildAyahSelectors() {
  const options = surahData.ayahs.map(a => `<option value="${a.numberInSurah}">Ayat ${a.numberInSurah}</option>`).join('');
  ['ayahSelect','submitStart','submitEnd','liveStart','liveEnd'].forEach(id => $(id).innerHTML = options);
  $('ayahSelect').value = state.activeAyah;
  $('submitStart').value = state.activeAyah;
  $('submitEnd').value = Math.min(state.activeAyah + Number(state.settings.dailyNew) - 1, surahData.ayahs.length);
  $('liveStart').value = state.activeAyah;
  $('liveEnd').value = Math.min(state.activeAyah + Number(state.settings.dailyNew) - 1, surahData.ayahs.length);
}

function bindNavigation() {
  $$('.nav button, .mobile-bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  $$('[data-jump]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.jump)));
  $('hamburger').addEventListener('click', () => $('sidebar').classList.toggle('open'));
}

function showView(view) {
  $$('.nav button, .mobile-bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
  const titleMap = { today: 'Hari Ini', hifzh: 'Hafalan Baru', submit: 'Setor AI', live: 'Live Setor', murajaah: 'Murajaah', map: 'Peta Hafalan', coach: 'AI Coach', settings: 'Target' };
  $('pageTitle').textContent = titleMap[view] || 'Mutqin AI';
  $('sidebar').classList.remove('open');
  if (view !== 'live' && liveFocusMode) toggleLiveFocus(false);
  syncMobileUi();
  renderAll();
}

function bindActions() {
  $('surahSelect').addEventListener('change', e => loadSurah(e.target.value));
  $('refreshBtn').addEventListener('click', () => loadSurah(state.selectedSurah));
  $('ayahSelect').addEventListener('change', e => setActiveAyah(Number(e.target.value)));
  $('prevAyah').addEventListener('click', () => setActiveAyah(Math.max(1, state.activeAyah - 1)));
  $('nextAyah').addEventListener('click', () => setActiveAyah(Math.min(surahData.ayahs.length, state.activeAyah + 1)));
  $('playAyah').addEventListener('click', playActiveAyah);
  $('hideModeBtn').addEventListener('click', () => renderHideDrill());
  $('missingWordsBtn').addEventListener('click', () => renderMissingWordsDrill());
  $('showAnswerBtn').addEventListener('click', showDrillAnswer);
  $('againDrillBtn').addEventListener('click', () => lastDrillType === 'missing' ? renderMissingWordsDrill() : renderHideDrill());
  $('markMemorizedBtn').addEventListener('click', markActiveStrong);
  $('submitStart').addEventListener('change', syncSubmitTarget);
  $('submitEnd').addEventListener('change', syncSubmitTarget);
  $('toggleSubmitTarget').addEventListener('click', () => { submitTargetVisible = !submitTargetVisible; syncSubmitTarget(); });
  $('startRecordBtn').addEventListener('click', startRecording);
  $('stopRecordBtn').addEventListener('click', stopRecording);
  $('startSpeechBtn').addEventListener('click', startSpeechToText);
  $('apiTranscribeBtn').addEventListener('click', transcribeWithApi);
  $('analyzeSubmission').addEventListener('click', analyzeSubmission);
  $('apiAnalyzeSubmission').addEventListener('click', analyzeSubmissionWithApi);
  $('liveStart').addEventListener('change', resetLiveSetor);
  $('liveEnd').addEventListener('change', resetLiveSetor);
  $('startLiveSetor').addEventListener('click', startLiveSetor);
  $('stopLiveSetor').addEventListener('click', stopLiveSetor);
  $('resetLiveSetor').addEventListener('click', resetLiveSetor);
  $('liveHintBtn').addEventListener('click', liveHint);
  $('saveLiveSetor').addEventListener('click', saveLiveSetor);
  $('liveFocusBtn').addEventListener('click', () => toggleLiveFocus());
  $('liveSoundTestBtn').addEventListener('click', testLiveErrorCue);
  window.addEventListener('resize', syncMobileUi);
  $('completeAllReview').addEventListener('click', completeAllDueReviews);
  $('saveSettings').addEventListener('click', saveSettings);
  $('resetData').addEventListener('click', resetData);
  $('askCoach').addEventListener('click', askCoach);
  $('coachInput').addEventListener('keydown', e => { if (e.key === 'Enter') askCoach(); });
  $$('.method-list button').forEach(btn => btn.addEventListener('click', () => {
    $('coachInput').value = btn.dataset.prompt;
    askCoach();
  }));
}

function isMobileViewport() {
  return window.innerWidth <= 900;
}

function syncMobileUi() {
  const liveActive = $('view-live').classList.contains('active');
  const btn = $('liveFocusBtn');
  if (btn) {
    btn.textContent = liveFocusMode ? 'Keluar fokus' : 'Mode fokus';
    btn.classList.toggle('liveFocus-primary', liveFocusMode);
  }
  document.body.classList.toggle('live-focus', !!(liveFocusMode && liveActive));
}

function toggleLiveFocus(force) {
  liveFocusMode = typeof force === 'boolean' ? force : !liveFocusMode;
  syncMobileUi();
}

function setActiveAyah(num) {
  state.activeAyah = Number(num);
  saveState();
  renderAll();
}

function currentAyah() {
  return surahData.ayahs.find(a => a.numberInSurah === state.activeAyah) || surahData.ayahs[0];
}

function renderAll() {
  if (!surahData.ayahs.length) return;
  renderStats();
  renderToday();
  renderHifzh();
  syncSubmitTarget();
  renderLiveReveal();
  renderReviewList();
  renderMemoryMap();
  renderMistakeBank();
  renderNavigator();
  renderPlannerSummary();
  renderCoachChat();
}

function renderStats() {
  const relevant = Object.entries(state.progress).filter(([key]) => key.startsWith(`${state.selectedSurah}:`)).map(([, p]) => p);
  $('strongCount').textContent = relevant.filter(p => p.status === 'strong').length;
  $('weakCount').textContent = relevant.filter(p => ['weak','shaky'].includes(p.status)).length;
  $('dueCount').textContent = getDueAyahs().length;
  $('streakCount').textContent = `${state.streak.count || 0} hari`;
}

function getDueAyahs() {
  const today = todayISO();
  return surahData.ayahs.filter(a => {
    const p = getProgress(a.numberInSurah);
    return p.nextReview <= today || ['weak','shaky'].includes(p.status);
  });
}

function getSurahProgressSummary() {
  const ayahs = surahData.ayahs || [];
  const touched = ayahs.filter(a => getProgress(a.numberInSurah).reps > 0).length;
  const strong = ayahs.filter(a => getProgress(a.numberInSurah).status === 'strong').length;
  const weak = ayahs.filter(a => ['weak','shaky'].includes(getProgress(a.numberInSurah).status)).length;
  const completion = ayahs.length ? Math.round(touched / ayahs.length * 100) : 0;
  const bestAvg = ayahs.length ? Math.round(ayahs.reduce((sum, a) => sum + (getProgress(a.numberInSurah).bestScore || 0), 0) / ayahs.length) : 0;
  return { touched, strong, weak, completion, bestAvg, total: ayahs.length, due: getDueAyahs().length };
}

function getTargetMeta() {
  const s = state.settings || {};
  const summary = getSurahProgressSummary();
  const dailyNew = Number(s.dailyNew || 2);
  const dailyMurajaah = Number(s.dailyMurajaah || 5);
  const weeklyGoal = Number(s.weeklyGoal || Math.max(5, dailyNew * 5));
  const remaining = Math.max(0, summary.total - summary.touched);
  const estDays = dailyNew ? Math.ceil(remaining / dailyNew) : null;
  const milestone = s.milestoneName || 'Juz 30 mutqin';
  const targetDate = s.targetDate || '';
  const daysLeft = targetDate ? Math.max(0, Math.ceil((new Date(targetDate) - new Date(todayISO())) / 86400000)) : null;
  return { dailyNew, dailyMurajaah, weeklyGoal, remaining, estDays, milestone, targetDate, daysLeft };
}

function renderNavigator() {
  if (!$('todayNavigator') || !$('murajaahOverview') || !$('mapSummary')) return;
  const sum = getSurahProgressSummary();
  const meta = getTargetMeta();
  const focusLabel = sum.weak ? `Fokus ${sum.weak} ayat rawan` : (meta.remaining ? `Tambah ${Math.min(meta.dailyNew, meta.remaining)} ayat baru` : 'Masuk fase penguatan');
  $('todayNavigator').innerHTML = [
    navStat('Progress surah', `${sum.completion}%`, `${sum.touched}/${sum.total} ayat sudah disentuh.`),
    navStat('Target harian', `${meta.dailyNew} baru`, `Murajaah ${meta.dailyMurajaah} ayat per hari.`),
    navStat('Fokus utama', focusLabel, sum.weak ? 'Jangan tambah terlalu banyak dulu. Prioritaskan ayat lemah dan sambungan.' : 'Boleh lanjut menambah hafalan sambil menjaga review.'),
    navStat('Milestone', meta.milestone, meta.targetDate ? `Target ${formatDateID(meta.targetDate)}.` : 'Belum ada tanggal target.', true)
  ].join('');

  $('murajaahOverview').innerHTML = [
    navStat('Due hari ini', `${sum.due}`, sum.due ? 'Ada ayat yang perlu diulang hari ini.' : 'Belum ada due berat.'),
    navStat('Target murajaah', `${meta.dailyMurajaah} ayat`, 'Gunakan tombol Lancar / Masih salah untuk memperbarui kekuatan hafalan.'),
    navStat('Ayat rawan', `${sum.weak}`, sum.weak ? 'Ayat rawan akan lebih sering dimunculkan.' : 'Stabil. Pertahankan ritme.')
  ].join('');

  $('mapSummary').innerHTML = [
    navStat('Kuat', `${sum.strong}`, 'Sudah cukup stabil.'),
    navStat('Rawan/lemah', `${sum.weak}`, 'Butuh murajaah lebih dekat.'),
    navStat('Rata-rata terbaik', `${sum.bestAvg}%`, 'Menggambarkan kualitas hafalan di surah ini.')
  ].join('');
}

function navStat(label, strong, desc, highlight = false) {
  return `<div class="nav-stat ${highlight ? 'highlight' : ''}"><span class="label">${label}</span><strong>${strong}</strong><p>${desc}</p></div>`;
}

function renderPlannerSummary() {
  if (!$('plannerSummary')) return;
  const sum = getSurahProgressSummary();
  const meta = getTargetMeta();
  const estText = meta.estDays === null ? 'Belum ada estimasi.' : (meta.estDays === 0 ? 'Surah ini sudah seluruhnya disentuh. Masuk fase penguatan.' : `Sekitar ${meta.estDays} hari lagi untuk menyentuh semua ayat di surah ini.`);
  const weekText = `Target baru ${meta.weeklyGoal} ayat/minggu. Ritme harianmu saat ini ${meta.dailyNew} ayat baru + ${meta.dailyMurajaah} ayat murajaah.`;
  const milestoneText = meta.targetDate ? `Milestone “${meta.milestone}” ditargetkan ${formatDateID(meta.targetDate)}${meta.daysLeft !== null ? ` (${meta.daysLeft} hari lagi)` : ''}.` : `Tentukan tanggal untuk milestone “${meta.milestone}” agar ritme lebih terarah.`;
  const health = sum.weak > sum.strong && sum.weak > 0 ? 'Saat ini porsi murajaah sebaiknya lebih besar daripada hafalan baru.' : 'Komposisi hafalan dan murajaah sudah cukup seimbang.';
  $('plannerSummary').innerHTML = `
    <div class="planner-card">
      <h4>Roadmap surah</h4>
      <p>${estText}</p>
      <div class="progress-rail"><span style="width:${sum.completion}%"></span></div>
    </div>
    <div class="planner-card">
      <h4>Ritme pekanan</h4>
      <p>${weekText}</p>
    </div>
    <div class="planner-card">
      <h4>Milestone besar</h4>
      <p>${milestoneText}</p>
    </div>
    <div class="planner-card">
      <h4>Kesehatan hafalan</h4>
      <p>${health}</p>
    </div>
  `;
}

function formatDateID(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function renderToday() {
  const due = getDueAyahs();
  const meta = getTargetMeta();
  const nextNew = findNextNewAyahs(Number(state.settings.dailyNew));
  const weak = due.filter(a => ['weak','shaky'].includes(getProgress(a.numberInSurah).status));
  $('sessionEstimate').textContent = `±${state.settings.dailyMinutes} menit`;
  $('todayPlan').innerHTML = [
    planItem('1', 'Murajaah pemanasan', due.length ? `${due.slice(0, 4).map(a => `ayat ${a.numberInSurah}`).join(', ')}${due.length > 4 ? '...' : ''}` : 'Belum ada due. Mulai dari ayat baru.'),
    planItem('2', 'Hafalan baru', nextNew.length ? `${surahData.name} ayat ${nextNew.map(a => a.numberInSurah).join(', ')} · target ${meta.dailyNew} ayat baru` : 'Semua ayat di surah ini sudah disentuh.'),
    planItem('3', 'Setor AI', `Setor ${nextNew.length ? `ayat ${nextNew[0].numberInSurah}` : `ayat ${state.activeAyah}`} tanpa melihat mushaf.`),
    planItem('4', 'Perbaikan fokus', weak.length ? `Prioritaskan ayat ${weak.map(a => a.numberInSurah).join(', ')}. Target murajaah hari ini ${meta.dailyMurajaah} ayat.` : `Jaga konsistensi. Sisihkan murajaah ${meta.dailyMurajaah} ayat hari ini.`)
  ].join('');
  $('coachSummary').textContent = generateSummary();
  const priority = [...weak, ...due, ...nextNew].filter(uniqueByAyah).slice(0, 8);
  $('priorityVerses').innerHTML = priority.length ? priority.map(renderVerseRow).join('') : '<p class="analysis-empty">Belum ada prioritas. Coba mulai dari hafalan baru lalu setor 1 ayat.</p>';
}

function planItem(icon, title, desc) {
  return `<div class="plan-item"><div class="icon">${icon}</div><div><strong>${title}</strong><span>${desc}</span></div></div>`;
}
function uniqueByAyah(value, index, array) {
  return array.findIndex(v => v.numberInSurah === value.numberInSurah) === index;
}
function renderVerseRow(ayah) {
  const p = getProgress(ayah.numberInSurah);
  return `<button class="verse-row" onclick="window.Mutqin.setActive(${ayah.numberInSurah})"><strong>${surahData.name} ayat ${ayah.numberInSurah} — ${statusLabel(p.status)}</strong><p>${diagnoseProgress(p)}</p></button>`;
}

function findNextNewAyahs(limit) {
  return surahData.ayahs.filter(a => getProgress(a.numberInSurah).reps === 0).slice(0, limit);
}

function generateSummary() {
  const relevant = Object.entries(state.progress).filter(([key]) => key.startsWith(`${state.selectedSurah}:`)).map(([, p]) => p);
  if (!relevant.length || relevant.every(p => p.reps === 0)) return 'Mulai pelan: hafalkan 1–2 ayat, tutup mushaf, lalu setor. Setelah itu app akan membaca bagian yang rawan.';
  const weak = relevant.filter(p => ['weak','shaky'].includes(p.status)).length;
  const strong = relevant.filter(p => p.status === 'strong').length;
  const avg = Math.round(relevant.reduce((sum, p) => sum + (p.strength || 0), 0) / relevant.length);
  if (weak > strong) return `Fokus hari ini jangan tambah banyak dulu. Ada ${weak} ayat rawan; kuatkan sambungan dan ulang dengan tes tanpa melihat.`;
  if (avg >= 75) return `Progresmu cukup stabil. Boleh tambah ayat baru, tapi tetap sisakan 40–50% sesi untuk murajaah lama.`;
  return `Hafalan mulai terbentuk, tapi belum mutqin. Pakai pola 3-3-1: 3x melihat, 3x tanpa melihat, 1x rekam penuh.`;
}

function renderHifzh() {
  const ayah = currentAyah();
  if (!ayah) return;
  $('activeAyahPill').textContent = `${surahData.name} ${ayah.numberInSurah}`;
  $('ayahSelect').value = ayah.numberInSurah;
  $('ayahArabic').textContent = ayah.text;
  $('ayahTranslation').textContent = ayah.translation;
  const p = getProgress(ayah.numberInSurah);
  const steps = [
    ['Dengar', p.reps > 0], ['Baca melihat', p.reps > 0], ['Tutup mushaf', p.hintsUsed > 0 || p.reps > 1], ['Setor', p.bestScore > 0]
  ];
  $('memorizeSteps').innerHTML = steps.map(([name, done], i) => `<div class="step ${done ? 'done' : ''}"><strong>${i+1}. ${name}</strong><span>${done ? 'Sudah disentuh' : 'Belum'}</span></div>`).join('');
}

function playActiveAyah() {
  const ayah = currentAyah();
  if (!ayah?.audio) return alert('Audio belum tersedia untuk ayat ini.');
  if (currentAudio) currentAudio.pause();
  currentAudio = new Audio(ayah.audio);
  currentAudio.play();
  const p = getProgress(ayah.numberInSurah);
  setProgress(ayah.numberInSurah, { reps: p.reps + 1, lastReviewed: todayISO(), nextReview: addDays(1) });
  updateStreak();
  renderAll();
}

function renderHideDrill() {
  lastDrillType = 'hide';
  const ayah = currentAyah();
  $('drillTitle').textContent = 'Tutup mushaf';
  $('drillBox').innerHTML = `<div><p class="eyebrow">Clue</p><p class="hidden-arabic">${firstWords(ayah.text, 2)} ...</p><p>Baca ayat lengkap tanpa melihat. Kalau macet, baru klik lihat jawaban.</p></div>`;
  const p = getProgress(ayah.numberInSurah);
  setProgress(ayah.numberInSurah, { hintsUsed: (p.hintsUsed || 0) + 1 });
}

function renderMissingWordsDrill() {
  lastDrillType = 'missing';
  const ayah = currentAyah();
  $('drillTitle').textContent = 'Ayat hilang';
  $('drillBox').innerHTML = `<p class="hidden-arabic">${missingWords(ayah.text)}</p>`;
}

function showDrillAnswer() {
  const ayah = currentAyah();
  $('drillBox').innerHTML = `<div><p class="eyebrow">Jawaban</p><p class="hidden-arabic">${ayah.text}</p><p>${ayah.translation}</p></div>`;
}

function firstWords(text, n) {
  return text.split(/\s+/).slice(0, n).join(' ');
}

function missingWords(text) {
  const words = text.split(/\s+/);
  const count = Math.max(1, Math.ceil(words.length * 0.22));
  const indexes = new Set();
  while (indexes.size < count && indexes.size < words.length) {
    const idx = Math.floor(Math.random() * words.length);
    if (idx > 0) indexes.add(idx);
  }
  return words.map((word, idx) => indexes.has(idx) ? '<span class="blank-word"></span>' : word).join(' ');
}

function markActiveStrong() {
  const ayah = currentAyah();
  setProgress(ayah.numberInSurah, {
    status: 'strong', strength: 88, reps: getProgress(ayah.numberInSurah).reps + 1,
    lastReviewed: todayISO(), nextReview: addDays(7), bestScore: Math.max(getProgress(ayah.numberInSurah).bestScore || 0, 88)
  });
  updateStreak();
  renderAll();
}

function syncSubmitTarget() {
  if (!surahData.ayahs.length) return;
  let start = Number($('submitStart').value || state.activeAyah);
  let end = Number($('submitEnd').value || start);
  if (end < start) {
    end = start;
    $('submitEnd').value = end;
  }
  const ayahs = getAyahRange(start, end);
  if (!submitTargetVisible) {
    $('submitTarget').className = 'target-hidden';
    $('submitTarget').textContent = `Teks disembunyikan. Setor ${surahData.name} ayat ${start}${end !== start ? '–' + end : ''} dari hafalanmu.`;
  } else {
    $('submitTarget').className = 'target-hidden target-shown';
    $('submitTarget').innerHTML = ayahs.map(a => `<span>${a.text}</span>`).join(' ۝ ');
  }
}

function getAyahRange(start, end) {
  return surahData.ayahs.filter(a => a.numberInSurah >= start && a.numberInSurah <= end);
}


function getLiveRange() {
  if (!$('liveStart') || !$('liveEnd')) return [];
  let start = Number($('liveStart').value || state.activeAyah);
  let end = Number($('liveEnd').value || start);
  if (end < start) {
    end = start;
    $('liveEnd').value = end;
  }
  return getAyahRange(start, end);
}

function liveTokens() {
  return getLiveRange().flatMap(ayah => ayah.text.split(/\s+/).filter(Boolean).map((word, index) => ({
    ayah: ayah.numberInSurah,
    word,
    norm: normalizeArabic(word),
    index
  })));
}

const MUQATTA_SEQUENCES = [
  { letters: ['الف','لام','ميم','صاد'], token: 'المص' },
  { letters: ['الف','لام','ميم','راء'], token: 'المر' },
  { letters: ['الف','لام','راء'], token: 'الر' },
  { letters: ['الف','لام','ميم'], token: 'الم' },
  { letters: ['كاف','ها','ياء','عين','صاد'], token: 'كهيعص' },
  { letters: ['طا','ها'], token: 'طه' },
  { letters: ['طا','سين','ميم'], token: 'طسم' },
  { letters: ['طا','سين'], token: 'طس' },
  { letters: ['ياء','سين'], token: 'يس' },
  { letters: ['حا','ميم'], token: 'حم' },
  { letters: ['عين','سين','قاف'], token: 'عسق' },
  { letters: ['صاد'], token: 'ص' },
  { letters: ['قاف'], token: 'ق' },
  { letters: ['نون'], token: 'ن' }
].sort((a, b) => b.letters.length - a.letters.length);

function normalizeLetterName(word) {
  const w = normalizeArabic(word);
  const aliases = {
    'اليف': 'الف', 'الف': 'الف',
    'لام': 'لام',
    'ميم': 'ميم',
    'راء': 'راء', 'را': 'راء',
    'كاف': 'كاف',
    'هاء': 'ها', 'ها': 'ها',
    'ياء': 'ياء', 'يا': 'ياء',
    'عين': 'عين',
    'صاد': 'صاد',
    'طاء': 'طا', 'طا': 'طا',
    'سين': 'سين',
    'حاء': 'حا', 'حا': 'حا',
    'قاف': 'قاف',
    'نون': 'نون'
  };
  return aliases[w] || w;
}

function spokenTokens(text) {
  const raw = normalizeArabic(text).split(' ').filter(Boolean).map(normalizeLetterName);
  const out = [];
  for (let i = 0; i < raw.length;) {
    let matched = false;
    for (const seq of MUQATTA_SEQUENCES) {
      const slice = raw.slice(i, i + seq.letters.length);
      if (slice.length === seq.letters.length && slice.every((x, idx) => x === seq.letters[idx])) {
        out.push(seq.token);
        i += seq.letters.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(raw[i]);
      i += 1;
    }
  }
  return out;
}

function wordSimilarity(a, b) {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen <= 2) return na === nb ? 1 : 0;
  return Math.max(0, 1 - levenshtein(na, nb) / maxLen);
}

function isPartialLiveWord(expected, heard) {
  const na = normalizeArabic(expected);
  const nb = normalizeArabic(heard);
  if (!na || !nb || nb.length < 2) return false;
  return na.startsWith(nb) || nb.startsWith(na);
}

function isWordMatch(expected, heard) {
  const ne = normalizeArabic(expected);
  const nh = normalizeArabic(heard);
  if (ne === nh) return true;
  const sim = wordSimilarity(ne, nh);
  const len = Math.max(ne.length, nh.length);
  return sim >= (len <= 4 ? 0.84 : 0.74);
}

function analyzeLiveSpokenWords(spokenWords, startTokenIndex = 0) {
  const tokens = liveTokens();
  let ti = Math.max(0, Math.min(startTokenIndex, tokens.length));
  let si = 0;
  const mismatches = [];
  let waitingPartial = false;

  while (ti < tokens.length && si < spokenWords.length) {
    const expected = tokens[ti];
    const heard = spokenWords[si];
    const isLastHeard = si === spokenWords.length - 1;

    if (isWordMatch(expected.norm, heard)) {
      ti += 1;
      si += 1;
      continue;
    }

    // Jangan langsung menganggap salah kalau kata terakhir masih potongan/interim.
    if (isLastHeard && isPartialLiveWord(expected.norm, heard)) {
      waitingPartial = true;
      break;
    }

    if (tokens[ti + 1] && isWordMatch(tokens[ti + 1].norm, heard)) {
      mismatches.push({ type: 'terlewat', expected: expected.word, heard });
      ti += 2;
      si += 1;
      continue;
    }
    if (spokenWords[si + 1] && isWordMatch(expected.norm, spokenWords[si + 1])) {
      mismatches.push({ type: 'tambahan', expected: expected.word, heard });
      si += 2;
      ti += 1;
      continue;
    }

    // Untuk live mode, satu kata yang belum cocok belum cukup untuk memvonis salah.
    mismatches.push({ type: 'beda', expected: expected.word, heard });
    si += 1;
    if (mismatches.length > 8) break;
  }

  return {
    tokens,
    spokenWords,
    startTokenIndex,
    matchedCount: ti,
    nextToken: tokens[ti] || null,
    mismatches,
    waitingPartial,
    finished: tokens.length > 0 && ti >= tokens.length
  };
}

function analyzeLiveTranscript(text, startTokenIndex = 0) {
  return analyzeLiveSpokenWords(spokenTokens(text), startTokenIndex);
}

function canonicalLiveTextUntil(count) {
  return liveTokens().slice(0, Math.max(0, count)).map(t => t.word).join(' ');
}

function livePhraseFrom(index, length = 3) {
  return liveTokens().slice(Math.max(0, index), Math.max(0, index) + length).map(t => t.word).join(' ');
}

function enterLiveRecovery(stableAnalysis) {
  const checkpoint = Math.max(0, Math.min(liveLastMatchCount, stableAnalysis.matchedCount) - 2);
  liveRecovery = {
    active: true,
    checkpoint,
    errorIndex: Math.max(liveLastMatchCount, stableAnalysis.matchedCount),
    spokenStart: stableAnalysis.spokenWords.length,
    createdAt: Date.now()
  };
  liveLastMatchCount = checkpoint;
  liveLastProgressAt = Date.now();
  liveStableMismatchStreak = 0;
}

function clearLiveRecoveryTo(matchedCount) {
  liveRecovery = null;
  liveLastMatchCount = Math.max(0, matchedCount);
  liveLastProgressAt = Date.now();
  liveStableMismatchStreak = 0;
  liveFinalText = canonicalLiveTextUntil(liveLastMatchCount);
  liveInterimText = '';
}

function acceptLivePoint() {
  const text = `${liveFinalText} ${liveInterimText}`.trim();
  const analysis = analyzeLiveTranscript(text, liveRecovery?.checkpoint || 0);
  const next = Math.min(analysis.tokens.length, Math.max(liveLastMatchCount + 1, analysis.matchedCount + 1));
  clearLiveRecoveryTo(next);
  $('liveCorrection').className = 'live-correction hidden';
  renderLiveReveal();
}

function rewindLivePoint() {
  const checkpoint = liveRecovery?.checkpoint ?? Math.max(0, liveLastMatchCount - 2);
  clearLiveRecoveryTo(checkpoint);
  $('liveCorrection').className = 'live-correction';
  $('liveCorrection').innerHTML = `<strong>Ulang dari sini:</strong><br><span class="arabic-inline">${escapeHtml(livePhraseFrom(checkpoint, 3))}</span><br><small>Setelah potongan ini terbaca benar, sistem lanjut otomatis.</small>`;
  renderLiveReveal();
}


function renderLiveReveal() {
  if (!$('liveReveal')) return;
  const text = `${liveFinalText} ${liveInterimText}`.trim();
  const allSpokenWords = spokenTokens(text);
  let analysis = analyzeLiveSpokenWords(allSpokenWords);

  if (liveRecovery?.active) {
    const freshWords = allSpokenWords.slice(liveRecovery.spokenStart);
    const recoveryAnalysis = analyzeLiveSpokenWords(freshWords, liveRecovery.checkpoint);
    analysis = recoveryAnalysis;

    if (recoveryAnalysis.matchedCount > liveRecovery.errorIndex || recoveryAnalysis.finished) {
      clearLiveRecoveryTo(recoveryAnalysis.matchedCount);
      analysis = analyzeLiveTranscript(liveFinalText);
      $('liveCorrection').className = 'live-correction good';
      $('liveCorrection').textContent = 'Sudah kembali ke jalur. Lanjutkan bacaan dari titik berikutnya.';
    }
  }

  const tokens = analysis.tokens;
  if (!tokens.length) return;

  if (!text && !liveRecovery?.active) {
    $('liveReveal').innerHTML = '<p class="analysis-empty">Mulai live setoran. Mushaf live akan terbuka bertahap mengikuti bacaanmu.</p>';
    $('liveExpected').textContent = 'Mulai dari ayat pertama. Kata berikutnya tetap tersembunyi sampai terbaca.';
    $('liveModePill').textContent = 'Standby';
    return;
  }

  const byAyah = new Map();
  tokens.forEach((token, idx) => {
    if (!byAyah.has(token.ayah)) byAyah.set(token.ayah, []);
    byAyah.get(token.ayah).push({ ...token, globalIndex: idx });
  });

  const ayahParts = [];
  Array.from(byAyah.entries()).forEach(([ayahNum, items]) => {
    const opened = items.some(item => item.globalIndex < analysis.matchedCount) || items.some(item => item.globalIndex === analysis.matchedCount);
    if (!opened) return;
    const tokenHtml = items.map(item => {
      if (item.globalIndex < analysis.matchedCount) return `<span class="live-token matched">${escapeHtml(item.word)}</span>`;
      if (item.globalIndex === analysis.matchedCount) return `<span class="live-token current hidden-word">${escapeHtml(item.word)}</span>`;
      return `<span class="live-token hidden-word">${'&nbsp;'.repeat(Math.max(2, Math.min(6, item.word.length)))}</span>`;
    }).join(' ');
    ayahParts.push(`<span class="ayah-run">${tokenHtml}<span class="ayah-stop">۝ ${ayahNum}</span></span>`);
  });

  const liveRange = getLiveRange();
  const liveStart = liveRange[0]?.numberInSurah || Number($('liveStart').value || state.activeAyah);
  const liveEnd = liveRange[liveRange.length - 1]?.numberInSurah || Number($('liveEnd').value || liveStart);
  $('liveReveal').innerHTML = `
    <div class="mushaf-page-meta">${escapeHtml(surahData.name)} · Ayat ${liveStart}–${liveEnd}</div>
    <div class="mushaf-page-bismillah">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</div>
    <div class="mushaf-page-arabic">${ayahParts.join(' ') || '<span class="analysis-empty">Aku belum menangkap kata awalnya. Coba baca pelan dari awal ayat.</span>'}</div>
  `;
  const progress = tokens.length ? Math.round(analysis.matchedCount / tokens.length * 100) : 0;
  $('liveModePill').textContent = analysis.finished ? 'Selesai' : `${progress}% terbaca`;
  $('liveExpected').textContent = analysis.nextToken ? 'Lanjutkan bacaan. Mushaf akan terus terbuka mengikuti setoranmu.' : 'Setoran bagian ini selesai.';

  const correction = $('liveCorrection');
  if (analysis.finished) {
    correction.className = 'live-correction good';
    correction.textContent = 'Bagian setoran ini sudah terbaca sampai akhir. Kamu bisa simpan hasil atau setor ulang.';
    $('liveOrb').className = 'live-orb good';
    return;
  }

  if (analysis.matchedCount > liveLastMatchCount) {
    liveLastProgressAt = Date.now();
    liveStableMismatchStreak = 0;
  }

  const stableAnalysis = analyzeLiveTranscript(liveFinalText.trim());
  const stalledLongEnough = Date.now() - liveLastProgressAt > 2200;
  const hasStableEvidence = stableAnalysis.spokenWords.length >= Math.max(3, stableAnalysis.matchedCount + 2);
  const severeMismatch = !stableAnalysis.waitingPartial && stalledLongEnough && hasStableEvidence && stableAnalysis.mismatches.length >= 2 && stableAnalysis.matchedCount <= liveLastMatchCount;

  if (severeMismatch) liveStableMismatchStreak += 1;
  else liveStableMismatchStreak = 0;

  if (liveRecovery?.active) {
    const checkpointPhrase = livePhraseFrom(liveRecovery.checkpoint, 3);
    correction.className = 'live-correction recovery';
    correction.innerHTML = `<strong>Kembali ke titik aman.</strong><br>
      Ulangi dari <span class="arabic-inline">${escapeHtml(checkpointPhrase)}</span>. Tidak perlu mulai dari awal.
      <div class="recovery-actions">
        <button class="ghost" onclick="window.Mutqin.rewindLivePoint()">Ulang dari sini</button>
        <button class="success" onclick="window.Mutqin.acceptLivePoint()">Saya benar, lanjut</button>
      </div>`;
    $('liveOrb').className = 'live-orb warn';
  } else if (liveStableMismatchStreak >= 2) {
    enterLiveRecovery(stableAnalysis);
    const m = stableAnalysis.mismatches[stableAnalysis.mismatches.length - 1];
    const checkpointPhrase = livePhraseFrom(liveRecovery.checkpoint, 3);
    correction.className = 'live-correction recovery';
    correction.innerHTML = `<strong>Kemungkinan melenceng.</strong><br>
      Yang terdengar: ${escapeHtml(m.heard || '-')}. Ulangi dari <span class="arabic-inline">${escapeHtml(checkpointPhrase)}</span>.
      <div class="recovery-actions">
        <button class="ghost" onclick="window.Mutqin.rewindLivePoint()">Ulang dari sini</button>
        <button class="success" onclick="window.Mutqin.acceptLivePoint()">Saya benar, lanjut</button>
      </div>`;
    $('liveOrb').className = 'live-orb warn';
    maybeSpeakLiveCorrection('Stop sebentar. Ulangi dari potongan terakhir. Tidak perlu dari awal.');
  } else {
    correction.className = 'live-correction hidden';
    if ($('liveOrb').classList.contains('listening')) $('liveOrb').className = 'live-orb listening';
  }
  liveLastMatchCount = Math.max(liveLastMatchCount, analysis.matchedCount);
}

function primeLiveAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!liveAudioContext) liveAudioContext = new AudioContext();
    if (liveAudioContext.state === 'suspended') liveAudioContext.resume().catch(() => {});
    return liveAudioContext;
  } catch (err) {
    return null;
  }
}

function playErrorCue() {
  if (!liveSoundEnabled) return;
  const now = Date.now();
  if (now - liveLastErrorCue < 1200) return;
  liveLastErrorCue = now;

  const ctx = primeLiveAudio();
  if (!ctx) return;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.018);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
  master.connect(ctx.destination);

  const beep = (start, freq, dur) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.02);
  };

  // Dua beep pendek: terasa seperti “teet-teet”, tidak terlalu kasar.
  beep(0, 880, 0.11);
  beep(0.14, 660, 0.13);

  if (navigator.vibrate) navigator.vibrate([45, 25, 45]);
}

function triggerMistakePulse() {
  document.body.classList.remove('mistake-pulse');
  void document.body.offsetWidth;
  document.body.classList.add('mistake-pulse');
  setTimeout(() => document.body.classList.remove('mistake-pulse'), 700);
}

function testLiveErrorCue() {
  primeLiveAudio();
  playErrorCue();
  triggerMistakePulse();
  const correction = $('liveCorrection');
  if (correction) {
    correction.className = 'live-correction';
    correction.innerHTML = '<strong>Contoh pengingat:</strong><br>Bunyi teet akan muncul kalau sistem yakin bacaan melenceng.';
    setTimeout(() => {
      if (correction.textContent.includes('Contoh pengingat')) correction.className = 'live-correction hidden';
    }, 2200);
  }
}

function maybeSpeakLiveCorrection(message) {
  const now = Date.now();
  if (now - liveLastSpokenWarning < 4500) return;
  liveLastSpokenWarning = now;

  playErrorCue();
  triggerMistakePulse();

  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(message);
  utter.lang = 'id-ID';
  utter.rate = 0.95;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

function startLiveSetor() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    alert('Live Setor butuh browser yang mendukung SpeechRecognition. Coba Chrome/Edge. Untuk versi gratis, mode ini tetap pakai transkrip browser; Gemini dipakai untuk analisis setelah setoran.');
    return;
  }
  if (liveRecognition) stopLiveSetor();
  liveFinalText = '';
  liveInterimText = '';
  liveLastMatchCount = 0;
  liveLastProgressAt = Date.now();
  liveStableMismatchStreak = 0;
  liveRecovery = null;
  $('liveModePill').textContent = 'Mendengar';
  $('liveStatus').textContent = 'Sedang mendengar. Baca dari hafalan, jangan melihat mushaf.';
  $('liveOrb').className = 'live-orb listening';
  $('startLiveSetor').disabled = true;
  $('stopLiveSetor').disabled = false;
  primeLiveAudio();
  if (isMobileViewport()) toggleLiveFocus(true);
  renderLiveReveal();

  liveRecognition = new Recognition();
  liveRecognition.lang = 'ar-SA';
  liveRecognition.continuous = true;
  liveRecognition.interimResults = true;
  liveRecognition.maxAlternatives = 1;
  liveRecognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) liveFinalText += ' ' + transcript;
      else interim += ' ' + transcript;
    }
    liveInterimText = interim;
    const full = `${liveFinalText} ${liveInterimText}`.trim();
    renderLiveReveal();
  };
  liveRecognition.onerror = e => {
    $('liveStatus').textContent = `Live transkrip terganggu: ${e.error || 'error'}. Kamu bisa mulai ulang.`;
    $('liveOrb').className = 'live-orb warn';
  };
  liveRecognition.onend = () => {
    $('startLiveSetor').disabled = false;
    $('stopLiveSetor').disabled = true;
    $('liveStatus').textContent = 'Live setoran berhenti.';
    if (!$('liveOrb').classList.contains('good')) $('liveOrb').className = 'live-orb';
  };
  liveRecognition.start();
}

function stopLiveSetor() {
  if (liveRecognition) {
    liveRecognition.stop();
    liveRecognition = null;
  }
  $('startLiveSetor').disabled = false;
  $('stopLiveSetor').disabled = true;
  $('liveStatus').textContent = 'Live setoran dihentikan.';
  if (!$('liveOrb').classList.contains('good')) $('liveOrb').className = 'live-orb';
}

function resetLiveSetor() {
  if (liveRecognition) stopLiveSetor();
  liveFinalText = '';
  liveInterimText = '';
  liveLastMatchCount = 0;
  liveLastProgressAt = Date.now();
  liveStableMismatchStreak = 0;
  liveRecovery = null;
  $('liveModePill').textContent = 'Standby';
  $('liveStatus').textContent = 'Belum mulai. Klik mulai lalu baca dari hafalan.';
  $('liveCorrection').className = 'live-correction hidden';
  $('liveOrb').className = 'live-orb';
  renderLiveReveal();
}

function liveHint() {
  const analysis = analyzeLiveTranscript(`${liveFinalText} ${liveInterimText}`.trim());
  const next = analysis.nextToken || analysis.tokens[0];
  if (!next) return;
  const sameAyah = analysis.tokens.filter(t => t.ayah === next.ayah);
  const idx = sameAyah.findIndex(t => t.word === next.word && t.index === next.index);
  const hint = sameAyah.slice(Math.max(0, idx), Math.max(0, idx) + 2).map(t => t.word).join(' ');
  $('liveCorrection').className = 'live-correction';
  $('liveCorrection').innerHTML = `<strong>Bantuan kecil:</strong> lanjutkan dari <span class="arabic-inline">${escapeHtml(hint)}</span>`;
  maybeSpeakLiveCorrection(`Bantuan kecil. Lanjutkan dari ${hint}`);
}

function saveLiveSetor() {
  const text = `${liveFinalText} ${liveInterimText}`.trim();
  if (!text) {
    alert('Belum ada transkrip live untuk disimpan.');
    return;
  }
  const ayahs = getLiveRange();
  const analysis = analyzeLiveTranscript(text);
  const totalScore = analysis.tokens.length ? Math.round(analysis.matchedCount / analysis.tokens.length * 100) : 0;
  ayahs.forEach(ayah => {
    const ayahTokens = analysis.tokens.filter(t => t.ayah === ayah.numberInSurah);
    const matched = ayahTokens.filter((t, idx) => analysis.tokens.findIndex(x => x.ayah === t.ayah && x.index === t.index) < analysis.matchedCount).length;
    const score = ayahTokens.length ? Math.round(matched / ayahTokens.length * 100) : totalScore;
    const prev = getProgress(ayah.numberInSurah);
    const mistakes = [...(prev.mistakes || [])];
    if (score < 80) mistakes.push({ type: 'live setoran belum lancar', date: todayISO(), score });
    if (analysis.mismatches.length) mistakes.push({ type: 'indikasi salah kata live', date: todayISO(), score });
    setProgress(ayah.numberInSurah, {
      status: scoreToStatus(score),
      strength: Math.max(prev.strength || 0, score),
      reps: (prev.reps || 0) + 1,
      bestScore: Math.max(prev.bestScore || 0, score),
      lastReviewed: todayISO(),
      nextReview: addDays(nextReviewGap(score)),
      mistakes: mistakes.slice(-20)
    });
  });
  state.submissions.unshift({
    surah: state.selectedSurah,
    start: ayahs[0]?.numberInSurah,
    end: ayahs[ayahs.length - 1]?.numberInSurah,
    score: totalScore,
    sim: totalScore,
    coverage: totalScore,
    fluency: totalScore >= 80 ? 4 : 2,
    help: 0,
    date: new Date().toISOString(),
    diagnosis: { notes: ['Live setoran disimpan dari transkrip real-time.'], mistakes: analysis.mismatches.length ? ['indikasi salah kata live'] : ['stabil'] }
  });
  state.submissions = state.submissions.slice(0, 50);
  updateStreak();
  saveState();
  renderAll();
  $('liveCorrection').className = 'live-correction good';
  $('liveCorrection').textContent = `Hasil live setoran disimpan. Skor sementara: ${totalScore}/100. Cek Peta Hafalan untuk ayat rawan.`;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Browser ini belum mendukung rekaman suara. Coba Chrome/Edge terbaru.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      lastAudioBlob = blob;
      const url = URL.createObjectURL(blob);
      $('audioPlayback').src = url;
      $('audioPlayback').classList.remove('hidden');
      stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    $('recordStatus').textContent = 'Sedang merekam... baca tanpa melihat mushaf.';
    $('recordLight').classList.add('live');
    $('startRecordBtn').disabled = true;
    $('stopRecordBtn').disabled = false;
  } catch (err) {
    alert('Mic tidak bisa diakses. Izinkan microphone dari browser.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  $('recordStatus').textContent = 'Rekaman selesai. Isi/transkrip bacaanmu lalu analisis.';
  $('recordLight').classList.remove('live');
  $('startRecordBtn').disabled = false;
  $('stopRecordBtn').disabled = true;
}

function startSpeechToText() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    alert('Speech-to-text belum didukung browser ini. Kamu tetap bisa mengetik transkrip secara manual.');
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'ar-SA';
  recognition.interimResults = true;
  recognition.continuous = true;
  let finalText = $('submissionText').value;
  recognition.onstart = () => $('recordStatus').textContent = 'Mendengar untuk transkrip Arab...';
  recognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += ' ' + transcript;
      else interim += transcript;
    }
    $('submissionText').value = `${finalText} ${interim}`.trim();
  };
  recognition.onerror = () => $('recordStatus').textContent = 'Transkrip otomatis gagal. Ketik manual jika perlu.';
  recognition.onend = () => $('recordStatus').textContent = 'Transkrip selesai/berhenti.';
  recognition.start();
  setTimeout(() => recognition.stop(), 25000);
}


async function transcribeWithApi() {
  if (!lastAudioBlob) {
    alert('Rekam audio dulu, baru klik Transkrip Gemini.');
    return;
  }
  const btn = $('apiTranscribeBtn');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Transkrip Gemini...';
  $('recordStatus').textContent = 'Mengirim audio ke backend untuk transkripsi Gemini...';
  try {
    const form = new FormData();
    form.append('audio', lastAudioBlob, 'setoran.webm');
    form.append('surah', String(state.selectedSurah));
    form.append('startAyah', $('submitStart').value);
    form.append('endAyah', $('submitEnd').value);
    form.append('targetText', getAyahRange(Number($('submitStart').value), Number($('submitEnd').value)).map(a => a.text).join(' '));
    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transkripsi gagal.');
    $('submissionText').value = data.text || '';
    $('recordStatus').textContent = data.warning || 'Transkripsi Gemini selesai. Silakan cek hasilnya sebelum analisis.';
  } catch (err) {
    $('recordStatus').textContent = 'Transkripsi Gemini gagal. Pastikan backend berjalan dan GEMINI_API_KEY sudah terpasang.';
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function analyzeSubmissionWithApi() {
  const start = Number($('submitStart').value);
  const end = Number($('submitEnd').value);
  const ayahs = getAyahRange(start, end);
  const userText = $('submissionText').value.trim();
  if (!userText) {
    alert('Isi transkrip dulu. Bisa dari Transkrip Gemini, transkrip browser, atau ketik manual.');
    return;
  }
  const btn = $('apiAnalyzeSubmission');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gemini berpikir...';
  $('analysisResult').className = 'analysis-empty';
  $('analysisResult').textContent = 'Gemini sedang menganalisis setoran dan menyusun latihan berikutnya...';
  try {
    const payload = {
      surahNumber: state.selectedSurah,
      surahName: surahData.name,
      startAyah: start,
      endAyah: end,
      ayahs: ayahs.map(a => ({ numberInSurah: a.numberInSurah, text: a.text, translation: a.translation })),
      targetText: ayahs.map(a => a.text).join(' '),
      transcript: userText,
      selfFluency: Number($('fluencyRange').value),
      helpUsed: Number($('helpUsed').value),
      currentProgress: ayahs.map(a => ({ ayah: a.numberInSurah, progress: getProgress(a.numberInSurah) }))
    };
    const res = await fetch('/api/analyze-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analisis Gemini gagal.');
    applyApiAnalysis(data, ayahs, start, end);
    renderApiAnalysis(data);
    renderAll();
  } catch (err) {
    $('analysisResult').className = 'analysis-empty';
    $('analysisResult').textContent = 'Analisis Gemini gagal. Kamu masih bisa pakai Analisis lokal.';
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function applyApiAnalysis(data, ayahs, start, end) {
  const overall = Number(data.overallScore || 0);
  const globalMistakes = Array.isArray(data.mistakeTypes) ? data.mistakeTypes : [];
  ayahs.forEach(ayah => {
    const ayahResult = (data.ayahs || []).find(a => Number(a.ayah) === Number(ayah.numberInSurah)) || {};
    const score = Number(ayahResult.score || overall || 0);
    const prev = getProgress(ayah.numberInSurah);
    const mistakes = [...(prev.mistakes || [])];
    const types = [...globalMistakes, ...(ayahResult.mistakes || [])].filter(Boolean);
    types.forEach(type => mistakes.push({ type, date: todayISO(), score }));
    setProgress(ayah.numberInSurah, {
      status: scoreToStatus(score),
      strength: Math.max(prev.strength || 0, score),
      reps: (prev.reps || 0) + 1,
      bestScore: Math.max(prev.bestScore || 0, score),
      lastReviewed: todayISO(),
      nextReview: addDays(nextReviewGap(score)),
      hintsUsed: (prev.hintsUsed || 0) + Number($('helpUsed').value || 0),
      mistakes: mistakes.slice(-20)
    });
  });
  state.submissions.unshift({
    surah: state.selectedSurah,
    start,
    end,
    score: overall,
    sim: data.similarityEstimate || overall,
    coverage: data.coverageEstimate || overall,
    fluency: Number($('fluencyRange').value),
    help: Number($('helpUsed').value),
    date: new Date().toISOString(),
    diagnosis: { notes: data.notes || [], mistakes: globalMistakes }
  });
  state.submissions = state.submissions.slice(0, 50);
  updateStreak();
  saveState();
}

function renderApiAnalysis(data) {
  const score = Number(data.overallScore || 0);
  const notes = Array.isArray(data.notes) ? data.notes : [];
  const drills = Array.isArray(data.nextDrills) ? data.nextDrills : [];
  const ayahRows = Array.isArray(data.ayahs) ? data.ayahs : [];
  $('analysisResult').className = '';
  $('analysisResult').innerHTML = `
    <div class="score-circle" style="--score:${score}%"><span>${score}</span></div>
    <div class="diagnosis-list">
      <div><strong>Analisis Gemini:</strong> ${escapeHtml(data.summary || 'Setoran dianalisis.')}</div>
      <div><strong>Catatan aman:</strong> ini diagnosis hafalan berbasis transkrip/audio, bukan fatwa tajwid final.</div>
      ${notes.map(note => `<div>${escapeHtml(note)}</div>`).join('')}
      ${drills.length ? `<div><strong>Latihan berikutnya:</strong><br>${drills.map(d => `• ${escapeHtml(d)}`).join('<br>')}</div>` : ''}
      ${ayahRows.length ? `<div><strong>Per ayat:</strong><br>${ayahRows.map(a => `Ayat ${a.ayah}: ${a.score}/100 — ${escapeHtml(a.comment || '')}`).join('<br>')}</div>` : ''}
    </div>
  `;
}

function normalizeArabic(text) {
  return (text || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[،؛؟.,!?:;\-ـ()\[\]{}"'“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a, b) {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

function wordCoverage(userText, targetText) {
  const userWords = normalizeArabic(userText).split(' ').filter(Boolean);
  const targetWords = normalizeArabic(targetText).split(' ').filter(Boolean);
  if (!userWords.length || !targetWords.length) return 0;
  const userSet = new Set(userWords);
  const matched = targetWords.filter(w => userSet.has(w)).length;
  return Math.round((matched / targetWords.length) * 100);
}

function analyzeSubmission() {
  const start = Number($('submitStart').value);
  const end = Number($('submitEnd').value);
  const ayahs = getAyahRange(start, end);
  const target = ayahs.map(a => a.text).join(' ');
  const userText = $('submissionText').value.trim();
  const fluency = Number($('fluencyRange').value);
  const help = Number($('helpUsed').value);
  if (!userText) {
    alert('Isi transkrip dulu. Kalau speech-to-text tidak bisa, ketik manual hasil bacaanmu.');
    return;
  }
  const sim = similarity(userText, target);
  const coverage = wordCoverage(userText, target);
  const fluencyScore = fluency * 20;
  const helpPenalty = help * 8;
  const finalScore = Math.max(0, Math.min(100, Math.round(sim * .55 + coverage * .25 + fluencyScore * .2 - helpPenalty)));
  const diagnosis = buildDiagnosis(finalScore, sim, coverage, fluency, help, ayahs.length);
  ayahs.forEach(ayah => {
    const singleSim = similarity(userText, ayah.text);
    const prev = getProgress(ayah.numberInSurah);
    const best = Math.max(prev.bestScore || 0, singleSim, finalScore);
    const status = scoreToStatus(Math.round((singleSim + finalScore) / 2));
    const mistakes = [...(prev.mistakes || [])];
    diagnosis.mistakes.forEach(m => mistakes.push({ type: m, date: todayISO(), score: finalScore }));
    setProgress(ayah.numberInSurah, {
      status,
      strength: Math.max(prev.strength || 0, Math.round((singleSim + finalScore) / 2)),
      reps: (prev.reps || 0) + 1,
      bestScore: best,
      lastReviewed: todayISO(),
      nextReview: addDays(nextReviewGap(finalScore)),
      hintsUsed: (prev.hintsUsed || 0) + help,
      mistakes: mistakes.slice(-20)
    });
  });
  state.submissions.unshift({ surah: state.selectedSurah, start, end, score: finalScore, sim, coverage, fluency, help, date: new Date().toISOString(), diagnosis });
  state.submissions = state.submissions.slice(0, 50);
  updateStreak();
  saveState();
  renderAnalysis(finalScore, sim, coverage, diagnosis);
  renderAll();
}

function buildDiagnosis(score, sim, coverage, fluency, help, length) {
  const notes = [];
  const mistakes = [];
  if (score >= 85) notes.push('Hafalan sangat bagus. Jarak murajaah bisa dipanjangkan, tapi tetap tes ulang 3–7 hari lagi.');
  if (score >= 70 && score < 85) notes.push('Hafalan sudah masuk, tapi belum mutqin. Ulangi tanpa teks dan fokus sambungan antar ayat.');
  if (score < 70) notes.push('Hafalan masih rawan. Jangan tambah ayat dulu sebelum setor ulang bagian ini.');
  if (sim < 70) { notes.push('Kemiripan urutan bacaan dengan target masih rendah. Coba baca per potongan, lalu gabungkan.'); mistakes.push('urutan/kata rawan'); }
  if (coverage < 75) { notes.push('Ada indikasi kata/frasa yang terlewat. Latihan ayat hilang cocok untuk bagian ini.'); mistakes.push('lupa kata'); }
  if (fluency <= 2) { notes.push('Kelancaran masih rendah. Pakai timer: baca penuh tanpa berhenti panjang.'); mistakes.push('jeda panjang'); }
  if (help >= 2) { notes.push('Kamu masih sering butuh bantuan teks. Turunkan bantuan bertahap: awal ayat saja, lalu kosong total.'); mistakes.push('tergantung bantuan'); }
  if (length > 1 && score < 82) { notes.push('Karena setoran lebih dari satu ayat, latihan sambung ayat perlu diprioritaskan.'); mistakes.push('sambungan ayat'); }
  if (!mistakes.length) mistakes.push('stabil');
  return { notes, mistakes };
}

function scoreToStatus(score) {
  if (score >= 82) return 'strong';
  if (score >= 65) return 'shaky';
  if (score >= 35) return 'weak';
  return 'new';
}
function nextReviewGap(score) {
  if (score >= 90) return 10;
  if (score >= 80) return 7;
  if (score >= 65) return 3;
  return 1;
}

function renderAnalysis(score, sim, coverage, diagnosis) {
  $('analysisResult').className = '';
  $('analysisResult').innerHTML = `
    <div class="score-circle" style="--score:${score}%"><span>${score}</span></div>
    <div class="diagnosis-list">
      <div><strong>Kemiripan teks:</strong> ${sim}% · <strong>Cakupan kata:</strong> ${coverage}%</div>
      ${diagnosis.notes.map(note => `<div>${note}</div>`).join('')}
      <div><strong>Masuk bank kesalahan:</strong> ${diagnosis.mistakes.join(', ')}</div>
    </div>
  `;
}

function renderReviewList() {
  const due = getDueAyahs();
  $('reviewList').innerHTML = due.length ? due.map(ayah => {
    const p = getProgress(ayah.numberInSurah);
    return `<div class="review-row"><strong>${surahData.name} ayat ${ayah.numberInSurah} — ${statusLabel(p.status)}</strong><p>${ayah.translation}</p><div class="mini-actions wrap"><button class="primary" onclick="window.Mutqin.play(${ayah.numberInSurah})">Dengar</button><button class="success" onclick="window.Mutqin.review(${ayah.numberInSurah}, true)">Lancar</button><button class="danger subtle" onclick="window.Mutqin.review(${ayah.numberInSurah}, false)">Masih salah</button></div></div>`;
  }).join('') : '<p class="analysis-empty">Tidak ada murajaah yang due. Kamu bisa tambah hafalan baru atau tes acak.</p>';
}

function reviewAyah(ayahNum, good) {
  const p = getProgress(ayahNum);
  const nextStrength = good ? Math.min(100, (p.strength || 40) + 10) : Math.max(0, (p.strength || 40) - 14);
  const status = good ? scoreToStatus(nextStrength) : (nextStrength < 55 ? 'weak' : 'shaky');
  const mistakes = [...(p.mistakes || [])];
  if (!good) mistakes.push({ type: 'murajaah belum lancar', date: todayISO(), score: nextStrength });
  setProgress(ayahNum, {
    status, strength: nextStrength, reps: (p.reps || 0) + 1,
    lastReviewed: todayISO(), nextReview: addDays(good ? nextReviewGap(nextStrength) : 1), mistakes: mistakes.slice(-20)
  });
  updateStreak();
  renderAll();
}

function completeAllDueReviews() {
  getDueAyahs().forEach(a => reviewAyah(a.numberInSurah, true));
}

function renderMemoryMap() {
  $('memoryMap').innerHTML = surahData.ayahs.map(ayah => {
    const p = getProgress(ayah.numberInSurah);
    return `<button class="ayah-tile ${p.status}" title="Ayat ${ayah.numberInSurah}: ${statusLabel(p.status)}" onclick="window.Mutqin.setActive(${ayah.numberInSurah})">${ayah.numberInSurah}</button>`;
  }).join('');
}

function renderMistakeBank() {
  const rows = [];
  Object.entries(state.progress).forEach(([key, p]) => {
    if (!key.startsWith(`${state.selectedSurah}:`)) return;
    const ayahNum = key.split(':')[1];
    (p.mistakes || []).slice(-5).forEach(m => rows.push({ ayahNum, ...m }));
  });
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $('mistakeBank').innerHTML = rows.length ? rows.slice(0, 16).map(m => `<div class="mistake-row"><strong>Ayat ${m.ayahNum} — ${m.type}</strong><p>${m.date} · skor ${m.score || '-'}</p></div>`).join('') : '<p class="analysis-empty">Belum ada catatan salah. Setelah setor, bagian rawan akan muncul di sini.</p>';
}

function statusLabel(status) {
  return ({ new: 'baru', strong: 'kuat', shaky: 'rawan', weak: 'lemah' })[status] || 'baru';
}
function diagnoseProgress(p) {
  if (p.status === 'strong') return `Skor terbaik ${p.bestScore || p.strength || 0}. Ulang sesuai jadwal agar tidak turun.`;
  if (p.status === 'shaky') return `Belum stabil. Review berikutnya ${p.nextReview || 'hari ini'}.`;
  if (p.status === 'weak') return `Butuh perbaikan. Latihan ayat hilang dan sambung ayat disarankan.`;
  return 'Belum banyak data. Mulai dengan dengar, tutup mushaf, lalu setor.';
}

function loadSettingsIntoForm() {
  $('userName').value = state.settings.name || '';
  $('dailyNew').value = state.settings.dailyNew || 2;
  $('dailyMurajaah').value = state.settings.dailyMurajaah || 5;
  $('weeklyGoal').value = state.settings.weeklyGoal || 10;
  $('dailyMinutes').value = state.settings.dailyMinutes || 30;
  $('milestoneName').value = state.settings.milestoneName || 'Juz 30 mutqin';
  $('targetDate').value = state.settings.targetDate || '';
  $('levelSelect').value = state.settings.level || 'beginner';
}
function saveSettings() {
  state.settings = {
    name: $('userName').value.trim(),
    dailyNew: Number($('dailyNew').value || 2),
    dailyMurajaah: Number($('dailyMurajaah').value || 5),
    weeklyGoal: Number($('weeklyGoal').value || 10),
    dailyMinutes: Number($('dailyMinutes').value || 30),
    level: $('levelSelect').value,
    milestoneName: $('milestoneName').value.trim() || 'Juz 30 mutqin',
    targetDate: $('targetDate').value || ''
  };
  saveState();
  renderAll();
  alert('Target disimpan.');
}
function resetData() {
  const ok = confirm('Reset semua progress, setoran, dan chat?');
  if (!ok) return;
  const selectedSurah = state.selectedSurah;
  state = structuredClone(DEFAULT_STATE);
  state.selectedSurah = selectedSurah;
  saveState();
  loadSettingsIntoForm();
  renderAll();
}

function updateStreak() {
  const today = todayISO();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0,10); })();
  if (state.streak.last === today) return;
  if (state.streak.last === yesterday) state.streak.count = (state.streak.count || 0) + 1;
  else state.streak.count = 1;
  state.streak.last = today;
  saveState();
}

async function askCoach() {
  const input = $('coachInput').value.trim();
  if (!input) return;
  state.chat.push({ role: 'user', text: input });
  state.chat.push({ role: 'bot', text: 'Gemini sedang menyusun saran latihan…' });
  state.chat = state.chat.slice(-30);
  $('coachInput').value = '';
  saveState();
  renderCoachChat();

  try {
    const context = {
      summary: generateSummary(),
      selectedSurah: surahData.name,
      activeAyah: state.activeAyah,
      dueAyahs: getDueAyahs().slice(0, 8).map(a => a.numberInSurah),
      latestSubmissions: state.submissions.slice(0, 3)
    };
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `${input}

Konteks aplikasi: ${JSON.stringify(context)}` })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gemini Coach gagal.');
    state.chat[state.chat.length - 1] = { role: 'bot', text: data.text || coachReply(input) };
  } catch (err) {
    state.chat[state.chat.length - 1] = { role: 'bot', text: `${coachReply(input)}

Catatan: Gemini belum aktif, jadi ini jawaban lokal. Isi GEMINI_API_KEY di backend agar coach memakai Gemini.` };
  }
  saveState();
  renderCoachChat();
}

function coachReply(prompt) {
  const text = prompt.toLowerCase();
  const summary = generateSummary();
  if (text.includes('sambung') || text.includes('lanjut')) {
    return `Fokuskan latihan sambung ayat: baca akhir ayat sebelumnya 3 kali, lalu langsung lanjut ayat berikutnya tanpa jeda. Untuk hari ini, pilih 2 sambungan paling rawan dari peta hafalan. ${summary}`;
  }
  if (text.includes('mirip') || text.includes('mutasyabihat') || text.includes('tertukar')) {
    return `Pakai mode pembeda: tulis kata pembeda antar ayat mirip, lalu tes dengan clue awal ayat saja. Kalau tertukar, jangan ulang full dulu; ulang 5 kali bagian sebelum titik tertukar.`;
  }
  if (text.includes('3-3-1') || text.includes('ayat baru')) {
    return `Metode 3-3-1: 3x baca melihat, 3x baca tanpa melihat per potongan, lalu 1x rekam penuh. Kalau skor setoran di bawah 70, jangan tambah ayat baru dulu.`;
  }
  if (text.includes('target') || text.includes('pekan') || text.includes('minggu')) {
    const due = getDueAyahs().length;
    const daily = Number(state.settings.dailyNew || 2);
    return `Target realistis pekan ini: tambah sekitar ${daily * 5} ayat maksimal, tapi sisakan 2 hari untuk penguatan. Saat ini ada ${due} ayat due murajaah, jadi jangan semua hari dipakai untuk nambah hafalan.`;
  }
  if (text.includes('lupa')) {
    return `Kalau sering lupa, masalahnya biasanya bukan kurang baca, tapi kurang recall. Latih begini: tutup mushaf, baca dari awal ayat, berhenti di titik lupa, lihat 1 kata saja, lalu ulang dari awal lagi.`;
  }
  return `${summary} Saran latihan: mulai dari 1 ayat, dengar qari, tutup mushaf, setor, lalu cek peta hafalan. Kalau ada ayat merah/kuning, ulangi sebelum tambah hafalan.`;
}

function renderCoachChat() {
  const chat = state.chat.length ? state.chat : [{ role: 'bot', text: 'Assalamu\'alaikum. Aku akan bantu susun latihan hafalan berdasarkan setoranmu. Coba tanya: “aku sering lupa sambungan ayat”.' }];
  $('coachChat').innerHTML = chat.map(m => `<div class="bubble ${m.role === 'user' ? 'user' : 'bot'}">${escapeHtml(m.text)}</div>`).join('');
  $('coachChat').scrollTop = $('coachChat').scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\'':'&#39;', '"':'&quot;' }[c]));
}

window.Mutqin = {
  setActive(num) { setActiveAyah(num); showView('hifzh'); },
  play(num) { state.activeAyah = num; saveState(); playActiveAyah(); },
  review: reviewAyah,
  acceptLivePoint,
  rewindLivePoint
};

document.addEventListener('DOMContentLoaded', init);
