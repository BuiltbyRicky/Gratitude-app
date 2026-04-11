// ══════════════════════════════════════════════════
// SUPABASE INIT
// ══════════════════════════════════════════════════
const SUPABASE_URL = 'https://epfewpuxztzbpzwmvzkx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZmV3cHV4enR6YnB6d212emt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMTU5NzIsImV4cCI6MjA5MDU5MTk3Mn0.tjSyCd3lHEUcSCIbY1VGihO2KUYQ5xg_Dh6bJJAadUA';

// sb is initialised inside initSupabase(), called from init() after DOM + scripts ready
let sb = null;

function initSupabase() {
  try {
    if (typeof supabase === 'undefined') return false;
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) {
    console.warn('Supabase failed to init:', e);
    return false;
  }
}

// Hard fallback — never show spinner for more than 4 seconds
const hardFallback = setTimeout(() => {
  hideLoading();
  showAuth();
}, 4000);

let currentUser = null;
let cachedEntries = [];

// ══════════════════════════════════════════════════
// INIT — check auth on load
// ══════════════════════════════════════════════════
async function init() {
  if (!initSupabase()) {
    clearTimeout(hardFallback);
    hideLoading();
    showAuth();
    return;
  }

  clearTimeout(hardFallback);

  // Check if this is a redirect back from email confirmation or password reset
  // Supabase puts #access_token=... or ?code=... in the URL
  const hash = window.location.hash;
  const search = window.location.search;
  const isAuthRedirect = hash.includes('access_token') || hash.includes('type=') || search.includes('code=');

  if (isAuthRedirect) {
    // Let Supabase process the tokens from the URL
    // Show a friendly "Confirming your account..." message while we wait
    const ls = document.getElementById('loading-screen');
    const logo = ls ? ls.querySelector('.loading-logo') : null;
    if (logo) logo.textContent = 'Confirming your account…';

    try {
      // Give Supabase time to exchange the token
      const result = await Promise.race([
        sb.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
      const session = result.data?.session || null;
      // Clean the URL so tokens don't linger
      window.history.replaceState({}, document.title, window.location.pathname);
      hideLoading();
      if (session) {
        currentUser = session.user;
        await launchApp();
      } else {
        // Token processed but no session yet — show login with success message
        showAuth();
        document.getElementById('auth-ok').textContent = '✓ Email confirmed! You can now sign in.';
        switchAuthTab('login');
      }
    } catch(e) {
      window.history.replaceState({}, document.title, window.location.pathname);
      hideLoading();
      showAuth();
      document.getElementById('auth-ok').textContent = '✓ Email confirmed! Please sign in.';
      switchAuthTab('login');
    }
    // Listen for ongoing auth changes and return
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) { currentUser = session.user; await launchApp(); }
      else if (event === 'SIGNED_OUT') { currentUser = null; cachedEntries = []; showAuth(); }
    });
    return;
  }

  // Normal load — check for existing session
  let session = null;
  try {
    const result = await Promise.race([
      sb.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    session = result.data?.session || null;
  } catch(e) {
    session = null;
  }

  hideLoading();

  if (session) {
    currentUser = session.user;
    await launchApp();
  } else {
    showAuth();
  }

  // Listen for auth changes
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      await launchApp();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      cachedEntries = [];
      showAuth();
    }
  });
}

function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (!ls) return;
  ls.classList.add('hidden');
  setTimeout(() => { if (ls) ls.style.display = 'none'; }, 300);
}

function showAuth() {
  const auth = document.getElementById('screen-auth');
  const app = document.getElementById('screen-app');
  if (auth) auth.classList.add('active');
  if (app) app.classList.remove('active');
}

async function launchApp() {
  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('screen-app').classList.add('active');
  // Show onboarding for first-time users
  if (!localStorage.getItem('gj_onboarded_' + currentUser.id)) {
    showOnboarding();
  }
  // Show home immediately — load entries in background
  goPage('home');
  loadEntries().then(() => {
    // Re-render home once entries are loaded
    if (document.getElementById('page-home').classList.contains('active')) {
      renderHome();
    }
  });
}

// ══════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1)));
  document.getElementById('pane-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('pane-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('pane-reset').style.display = tab === 'reset' ? 'block' : 'none';
  // Reset signup to form view when switching to it
  if (tab === 'signup') {
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('signup-confirm').style.display = 'none';
  }
  document.getElementById('auth-err').textContent = '';
  document.getElementById('auth-ok').textContent = '';
  // Focus the first field in the active pane
  setTimeout(() => {
    const pane = document.getElementById('pane-' + tab);
    if (pane) { const f = pane.querySelector('input'); if (f) f.focus(); }
  }, 50);
}

// Enter key submits auth forms
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const loginVisible = document.getElementById('pane-login')?.style.display !== 'none';
  const signupVisible = document.getElementById('pane-signup')?.style.display !== 'none';
  const resetVisible  = document.getElementById('pane-reset')?.style.display !== 'none';
  const authActive = document.getElementById('screen-auth')?.classList.contains('active');
  if (!authActive) return;
  if (loginVisible)  doLogin();
  else if (signupVisible && document.getElementById('signup-form')?.style.display !== 'none') doSignup();
  else if (resetVisible) doReset();
});

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  const err = document.getElementById('auth-err');
  if (!email || !pw) { err.textContent = 'Please fill in all fields.'; return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  btn.disabled = false; btn.textContent = 'Sign in →';
  if (error) err.textContent = error.message;
}

let lastSignupEmail = '';

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-pw').value;
  const err = document.getElementById('auth-err');
  if (!name || !email || !pw) { err.textContent = 'Please fill in all fields.'; return; }
  if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
  if (!email.includes('@')) { err.textContent = 'Please enter a valid email address.'; return; }
  const btn = document.getElementById('signup-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  const { error } = await sb.auth.signUp({
    email, password: pw,
    options: { data: { full_name: name } }
  });
  btn.disabled = false; btn.textContent = 'Start your free trial →';
  if (error) { err.textContent = error.message; return; }
  // Show confirmation screen
  lastSignupEmail = email;
  document.getElementById('signup-form').style.display = 'none';
  document.getElementById('signup-confirm').style.display = 'block';
  document.getElementById('confirm-email-display').textContent = email;
  err.textContent = '';
}

async function resendConfirmation() {
  const btn = document.getElementById('resend-btn');
  const status = document.getElementById('resend-status');
  if (!lastSignupEmail) return;
  btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.resend({ type: 'signup', email: lastSignupEmail });
  btn.disabled = false; btn.textContent = 'Resend confirmation email';
  if (error) { status.textContent = 'Could not resend — ' + error.message; status.style.color = 'var(--red)'; }
  else { status.textContent = '✓ Sent! Check your inbox again.'; status.style.color = 'var(--sage)'; }
}

async function doReset() {
  const email = document.getElementById('reset-email').value.trim();
  const err = document.getElementById('auth-err');
  const ok = document.getElementById('auth-ok');
  if (!email) { err.textContent = 'Please enter your email.'; return; }
  const btn = document.getElementById('reset-btn');
  btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  btn.disabled = false; btn.textContent = 'Send reset link →';
  if (error) { err.textContent = error.message; return; }
  ok.textContent = '✓ Reset link sent! Check your email inbox.';
}

async function doSignout() {
  await sb.auth.signOut();
}

// ══════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════
let obIdx = 0;
function showOnboarding() {
  obIdx = 0;
  document.getElementById('screen-onboard').classList.add('active');
  document.querySelectorAll('.ob-step').forEach((s, i) => s.classList.toggle('active', i === 0));
}
function obNext() {
  document.getElementById('ob-' + obIdx).classList.remove('active');
  obIdx++;
  document.getElementById('ob-' + obIdx).classList.add('active');
}
function finishOnboard() {
  document.getElementById('screen-onboard').classList.remove('active');
  if (currentUser) localStorage.setItem('gj_onboarded_' + currentUser.id, '1');
}

// ══════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════
function initTheme(){
  const saved = localStorage.getItem('gj_theme');
  if(saved === 'dark') document.documentElement.setAttribute('data-theme','dark');
  else if(saved === 'light') document.documentElement.setAttribute('data-theme','light');
  updateThemeBtn();
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme:dark)').matches);
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gj_theme', next);
  updateThemeBtn();
}
function updateThemeBtn(){
  const btn = document.getElementById('themeBtn'); if(!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme:dark)').matches);
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

// ══════════════════════════════════════════════════
// VOICE
// ══════════════════════════════════════════════════
const EL_VOICE = 'EXAVITQu4vr4xnSDxMaL';
let voiceOn = false, elKey = localStorage.getItem('gj_el_key') || '', activeAudio = null, bVoice = null;
function initBV() { if (!window.speechSynthesis) return; const l = () => { const vs = window.speechSynthesis.getVoices(); if (!vs.length) return; const names = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Allison', 'Ava']; for (const n of names) { const v = vs.find(x => x.name.includes(n)); if (v) { bVoice = v; break; } } if (!bVoice) bVoice = vs.find(v => v.lang.startsWith('en') && v.localService) || vs.find(v => v.lang.startsWith('en')) || vs[0]; }; l(); window.speechSynthesis.onvoiceschanged = l; }
function stopAudio() { if (activeAudio) { activeAudio.pause(); activeAudio = null; } if (window.speechSynthesis) window.speechSynthesis.cancel(); showBars(false); }
function say(text, done) { if (!voiceOn) { if (done) done(); return; } tts(text, done); }
function tts(text, done) { stopAudio(); if (elKey) { showBars(true); fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`, { method: 'POST', headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' }, body: JSON.stringify({ text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.72, similarity_boost: 0.85, style: 0.22, use_speaker_boost: true } }) }).then(r => { if (!r.ok) throw 0; return r.blob(); }).then(b => { const url = URL.createObjectURL(b); activeAudio = new Audio(url); activeAudio.onended = () => { showBars(false); URL.revokeObjectURL(url); if (done) done(); }; activeAudio.onerror = () => { showBars(false); if (done) done(); }; activeAudio.play(); }).catch(() => bTTS(text, done)); } else bTTS(text, done); }
function bTTS(text, done) { if (!window.speechSynthesis) { if (done) done(); return; } showBars(true); setTimeout(() => { const u = new SpeechSynthesisUtterance(text); u.rate = 0.78; u.pitch = 0.9; u.volume = 1; if (bVoice) u.voice = bVoice; u.onend = () => { showBars(false); if (done) done(); }; u.onerror = () => { showBars(false); if (done) done(); }; window.speechSynthesis.speak(u); }, 80); }
function showBars(v) { const el = document.getElementById('speak-anim'); if (el) el.classList.toggle('show', v); }
function toggleVoice() { voiceOn = !voiceOn; const b = document.getElementById('voiceBtn'); b.textContent = voiceOn ? '🔊 Voice on' : '🔈 Voice'; b.classList.toggle('on', voiceOn); if (!voiceOn) stopAudio(); else say(elKey ? 'Voice narration is on.' : 'Voice is on. Add your ElevenLabs key in Settings for the best experience.'); }
function persistKey() { const v = document.getElementById('key-input').value.trim(); const s = document.getElementById('key-status'); if (!v) { s.textContent = 'Please enter a key.'; s.className = 'key-status err'; return; } localStorage.setItem('gj_el_key', v); elKey = v; s.textContent = '✓ Key saved.'; s.className = 'key-status ok'; }

// ══════════════════════════════════════════════════
// SUPABASE DATA LAYER
// ══════════════════════════════════════════════════
async function loadEntries() {
  if (!currentUser) return;
  try {
    const { data, error } = await sb.from('entries')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false });
    if (!error && data) cachedEntries = data;
  } catch(e) {
    console.warn('Failed to load entries:', e);
  }
}

async function saveEntry(entry) {
  if (!currentUser) return false;
  try {
    const { data, error } = await sb.from('entries').insert({
      user_id: currentUser.id,
      date: entry.date,
      questions: entry.questions,
      answers: entry.answers,
      mood_before: entry.moodBefore ?? null,
      mood_after: entry.moodAfter ?? null
    }).select().single();
    if (error) throw error;
    if (data) cachedEntries.unshift(data);
    return true;
  } catch(e) {
    console.error('Failed to save entry:', e);
    return false;
  }
}

async function updateEntry(id, answers) {
  if (!currentUser || !sb) return;
  const { error } = await sb.from('entries').update({ answers }).eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    const idx = cachedEntries.findIndex(e => e.id === id);
    if (idx >= 0) cachedEntries[idx].answers = answers;
  }
}

async function deleteEntry(id) {
  if (!currentUser || !sb) return;
  const { error } = await sb.from('entries').delete().eq('id', id).eq('user_id', currentUser.id);
  if (!error) cachedEntries = cachedEntries.filter(e => e.id !== id);
}

// Helper getters using cached data
function getEntries() { return cachedEntries; }

// ── HTML ESCAPE — always use when injecting user content into innerHTML ──
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── STREAK FREEZE HELPERS ─────────────────────────
function freezeKey() { return currentUser ? 'gj_freeze_' + currentUser.id : 'gj_freeze'; }
function getISOWeek(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}_w${Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)}`;
}
function getFreezeData() {
  try { return JSON.parse(localStorage.getItem(freezeKey()) || '{}'); } catch(e) { return {}; }
}
function saveFreezeData(data) { localStorage.setItem(freezeKey(), JSON.stringify(data)); }
function freezeUsedThisWeek() {
  const data = getFreezeData();
  return data.weekKey === getISOWeek(new Date());
}
function getFrozenDates() {
  const data = getFreezeData();
  return data.frozenDates || [];
}

function streak() {
  const es = getEntries(); if (!es.length) return 0;
  const frozenDates = getFrozenDates();
  let s = 0, d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i++) {
    const ds = d.toDateString();
    const hasEntry = es.find(e => new Date(e.date).toDateString() === ds);
    const isFrozen = frozenDates.includes(ds);
    if (hasEntry || isFrozen) {
      s++;
      d.setDate(d.getDate() - 1);
    } else if (i === 0) {
      // Grace: today not yet journaled — skip to yesterday
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return s;
}

function weekCount() {
  const es = getEntries(), seen = new Set();
  const wa = new Date(); wa.setDate(wa.getDate() - 6); wa.setHours(0, 0, 0, 0);
  es.forEach(e => { if (new Date(e.date) >= wa) seen.add(new Date(e.date).toDateString()); });
  return seen.size;
}

// ── FREEZE CARD ───────────────────────────────────
function renderFreezeCard() {
  const wrap = document.getElementById('freeze-card-wrap');
  if (!wrap) return;

  const s = streak();
  // Only show if user has a streak worth protecting (3+)
  if (s < 3) { wrap.innerHTML = ''; return; }

  const usedThisWeek = freezeUsedThisWeek();

  // Check if yesterday was missed (i.e. freeze is actually useful right now)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(0,0,0,0);
  const yesterdayStr = yesterday.toDateString();
  const es = getEntries();
  const journaledYesterday = es.find(e => new Date(e.date).toDateString() === yesterdayStr);
  const frozenYesterday = getFrozenDates().includes(yesterdayStr);
  const canFreeze = !journaledYesterday && !frozenYesterday && !usedThisWeek;

  if (usedThisWeek && !canFreeze) {
    // Freeze already used — show status
    wrap.innerHTML = `
      <div class="freeze-card">
        <div class="freeze-icon">🧊</div>
        <div class="freeze-info">
          <div class="freeze-title">Streak freeze used</div>
          <div class="freeze-sub">Your free freeze for this week has been used. A new one is available next week.</div>
        </div>
        <div class="freeze-used"><span class="freeze-used-icon">✓</span></div>
      </div>`;
    return;
  }

  if (canFreeze) {
    // Yesterday was missed — offer to freeze it
    const yLabel = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    wrap.innerHTML = `
      <div class="freeze-card">
        <div class="freeze-icon">🧊</div>
        <div class="freeze-info">
          <div class="freeze-title">Protect your ${s}-day streak</div>
          <div class="freeze-sub">You missed <strong>${yLabel}</strong>. Use your free weekly freeze to keep your streak alive.</div>
        </div>
        <button class="freeze-btn" onclick="useFreeze()">Use freeze</button>
      </div>`;
    return;
  }

  // Streak is healthy — show freeze is available
  wrap.innerHTML = `
    <div class="freeze-card">
      <div class="freeze-icon">🧊</div>
      <div class="freeze-info">
        <div class="freeze-title">Streak freeze available</div>
        <div class="freeze-sub">If you miss a day this week, your freeze will automatically protect your ${s}-day streak. One per week.</div>
      </div>
      <div class="freeze-used" style="color:var(--sage);font-size:12px;font-weight:500;">Ready</div>
    </div>`;
}

function useFreeze() {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(0,0,0,0);
  const data = getFreezeData();
  data.weekKey = getISOWeek(new Date());
  data.frozenDates = [...(data.frozenDates || []), yesterday.toDateString()];
  saveFreezeData(data);
  renderFreezeCard();
  // Re-render home stats since streak may have changed
  const s = streak();
  document.getElementById('nav-streak').textContent = s;
  document.getElementById('st-streak').textContent = s;
  renderBadges(s);
}

// ══════════════════════════════════════════════════
// MOOD
// ══════════════════════════════════════════════════
const MOODS = [{ e: '😔', label: 'Struggling' }, { e: '😕', label: 'A bit low' }, { e: '😐', label: 'Okay' }, { e: '🙂', label: 'Pretty good' }, { e: '😄', label: 'Great!' }];
let moodBefore = null, moodAfter = null;

function renderMoodPicker(containerId, labelId) {
  const c = document.getElementById(containerId);
  c.innerHTML = MOODS.map((m, i) => `<button class="mood-btn" onclick="pickMood('${containerId}','${labelId}',${i})">${m.e}</button>`).join('');
}

function pickMood(containerId, labelId, idx) {
  document.querySelectorAll(`#${containerId} .mood-btn`).forEach((b, i) => b.classList.toggle('picked', i === idx));
  document.getElementById(labelId).textContent = MOODS[idx].label;
  if (containerId === 'mood-emojis-before') { moodBefore = idx; document.getElementById('mood-before-next').disabled = false; }
  else { moodAfter = idx; document.getElementById('mood-after-next').disabled = false; }
}

// ══════════════════════════════════════════════════
// HEATMAP
// ══════════════════════════════════════════════════
function renderHeatmap() {
  const entries = getEntries();
  const entryDates = new Set(entries.map(e => new Date(e.date).toDateString()));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const WEEKS = 26;
  const start = new Date(today); start.setDate(start.getDate() - (WEEKS * 7 - 1)); start.setDate(start.getDate() - start.getDay());
  const gridEl = document.getElementById('heatmap-grid');
  const monthsEl = document.getElementById('heatmap-months');
  if (!gridEl) return;
  gridEl.innerHTML = ''; monthsEl.innerHTML = '';
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const col = document.createElement('div'); col.className = 'heatmap-col';
    let monthForCol = -1;
    for (let d = 0; d < 7; d++) {
      const date = new Date(start); date.setDate(start.getDate() + w * 7 + d);
      if (date > today) { const blank = document.createElement('div'); blank.style.cssText = 'width:12px;height:12px;'; col.appendChild(blank); continue; }
      const cell = document.createElement('div'); cell.className = 'heatmap-cell';
      cell.title = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (entryDates.has(date.toDateString())) cell.classList.add('d3');
      col.appendChild(cell);
      if (date.getMonth() !== lastMonth) { lastMonth = date.getMonth(); monthForCol = date.getMonth(); }
    }
    gridEl.appendChild(col);
    const ml = document.createElement('div'); ml.className = 'heatmap-month-label'; ml.style.cssText = 'min-width:12px;text-align:center;';
    if (monthForCol >= 0) ml.textContent = MONTH_NAMES[monthForCol];
    monthsEl.appendChild(ml);
  }
}

// ══════════════════════════════════════════════════
// BADGES
// ══════════════════════════════════════════════════
const BADGE_DEF = [
  { id: 'b7', icon: '🌱', name: 'First week', desc: '7 day streak', days: 7 },
  { id: 'b14', icon: '🌿', name: 'Two weeks', desc: '14 day streak', days: 14 },
  { id: 'b30', icon: '🌳', name: 'One month', desc: '30 day streak', days: 30 },
  { id: 'b60', icon: '⭐', name: 'Two months', desc: '60 day streak', days: 60 },
  { id: 'b100', icon: '🏆', name: '100 days', desc: '100 day streak', days: 100 },
  { id: 'b365', icon: '💎', name: 'One year', desc: '365 day streak', days: 365 },
];

function renderBadges(currentStreak) {
  const key = currentUser ? 'gj_badges_' + currentUser.id : 'gj_badges';
  const earnedSet = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  BADGE_DEF.forEach(b => { if (currentStreak >= b.days && !earnedSet.has(b.id)) { earnedSet.add(b.id); celebrateBadge(b); } });
  localStorage.setItem(key, JSON.stringify([...earnedSet]));
  const el = document.getElementById('badges-grid'); if (!el) return;
  el.innerHTML = BADGE_DEF.map(b => {
    const earned = earnedSet.has(b.id);
    return `<div class="badge-tile ${earned ? 'earned' : ''}"><span class="badge-icon">${b.icon}</span><div class="badge-name">${b.name}</div><div class="badge-req">${b.desc}</div></div>`;
  }).join('');
}

function celebrateBadge(b) {
  document.getElementById('badge-cel-icon').textContent = b.icon;
  document.getElementById('badge-cel-title').textContent = b.name + ' unlocked!';
  document.getElementById('badge-cel-sub').textContent = `You've reached a ${b.days} day streak. That's something to be genuinely proud of.`;
  document.getElementById('badge-modal').classList.add('open');
  launchConfetti();
}
function closeBadgeModal() { document.getElementById('badge-modal').classList.remove('open'); }

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas'); const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const p = Array.from({ length: 80 }, () => ({ x: Math.random() * canvas.width, y: -10, r: Math.random() * 6 + 3, c: `hsl(${Math.random() * 360},70%,60%)`, v: Math.random() * 3 + 2, a: Math.random() * 0.1 - 0.05, s: Math.random() * 2 - 1 }));
  let frame = 0;
  const draw = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); p.forEach(p => { p.y += p.v; p.x += p.s; p.a += 0.01; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r); ctx.restore(); }); frame++; if (frame < 120) requestAnimationFrame(draw); else ctx.clearRect(0, 0, canvas.width, canvas.height); };
  draw();
}

// ══════════════════════════════════════════════════
// WEEKLY REFLECTION
// ══════════════════════════════════════════════════
function getWeekKey() { const d = new Date(); const jan1 = new Date(d.getFullYear(), 0, 1); const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7); return `${d.getFullYear()}_w${week}`; }

function getWeekEntries() {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  const wa = new Date(now); wa.setDate(wa.getDate() - 6); wa.setHours(0, 0, 0, 0);
  return getEntries().filter(e => { const d = new Date(e.date); return d >= wa && d <= now; });
}

function renderWeeklyReflection() {
  const el = document.getElementById('weekly-reflection'); if (!el) return;
  const userKey = currentUser ? 'gj_weekly_' + currentUser.id + '_' + getWeekKey() : 'gj_weekly_' + getWeekKey();
  if (localStorage.getItem(userKey + '_dismissed') === '1') { el.innerHTML = ''; return; }
  const we = getWeekEntries();
  if (we.length < 2) { el.innerHTML = ''; return; }
  const days = new Set(we.map(e => new Date(e.date).toDateString())).size;
  const withBoth = we.filter(e => e.mood_before != null && e.mood_after != null);
  const avgB = we.filter(e => e.mood_before != null).length ? Math.round(we.filter(e => e.mood_before != null).reduce((s, e) => s + e.mood_before, 0) / we.filter(e => e.mood_before != null).length) : null;
  const avgA = we.filter(e => e.mood_after != null).length ? Math.round(we.filter(e => e.mood_after != null).reduce((s, e) => s + e.mood_after, 0) / we.filter(e => e.mood_after != null).length) : null;
  const lift = withBoth.length ? +(withBoth.reduce((s, e) => s + (e.mood_after - e.mood_before), 0) / withBoth.length).toFixed(1) : null;
  let highlight = null, highlightDate = null;
  we.forEach(e => { (e.answers || []).forEach(a => { if (a && a.length > 30 && (!highlight || a.length > highlight.length)) { highlight = a; highlightDate = e.date; } }); });
  const msgs = [[7, 'You showed up every single day this week. That kind of commitment is rare and powerful.'], [5, "Five days this week. You're building something real — one entry at a time."], [3, "Three sessions this week. Consistency is a practice, not a perfection. You're doing it."], [2, 'Two entries this week. Every reflection counts.'], [0, 'You journaled this week. That alone is worth celebrating.']];
  const msg = msgs.find(([d]) => days >= d)[1];
  const moodHtml = avgB != null && avgA != null ? '<div class="weekly-mood-row"><div class="weekly-mood-block"><span class="weekly-mood-emoji">' + MOODS[avgB].e + '</span><div class="weekly-mood-label">avg before</div></div><div class="weekly-mood-arrow">→</div><div class="weekly-mood-block"><span class="weekly-mood-emoji">' + MOODS[avgA].e + '</span><div class="weekly-mood-label">avg after</div></div>' + (lift != null && lift > 0 ? '<span class="weekly-mood-lift">↑ ' + lift + ' avg lift</span>' : '') + '</div>' : '';
  const quoteHtml = highlight ? `<div class="weekly-quote"><div class="weekly-quote-text">"${esc(highlight.length > 120 ? highlight.slice(0, 120).trim() + '…' : highlight)}"</div><div class="weekly-quote-attr">— Your entry, ${new Date(highlightDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div></div>` : '';
  const now2 = new Date(), wa2 = new Date(); wa2.setDate(wa2.getDate() - 6);
  const range = wa2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + now2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  el.innerHTML = `<div class="weekly-card"><div class="weekly-eyebrow">Weekly reflection · ${range}</div><div class="weekly-stats"><div class="weekly-stat"><span class="weekly-stat-val">${days}</span><span class="weekly-stat-key">days journaled</span></div><div class="weekly-stat"><span class="weekly-stat-val">${we.length}</span><span class="weekly-stat-key">total entries</span></div><div class="weekly-stat"><span class="weekly-stat-val">${streak()}</span><span class="weekly-stat-key">day streak</span></div></div>${moodHtml}<div class="weekly-message">${msg}</div>${quoteHtml}<button class="weekly-dismiss" onclick="dismissWeekly()">Dismiss for this week</button></div>`;
}

function dismissWeekly() {
  const uk = currentUser ? 'gj_weekly_' + currentUser.id + '_' + getWeekKey() : 'gj_weekly_' + getWeekKey();
  localStorage.setItem(uk + '_dismissed', '1');
  document.getElementById('weekly-reflection').innerHTML = '';
}

// ══════════════════════════════════════════════════
// PAGES
// ══════════════════════════════════════════════════
// Page order for determining slide direction
const PAGE_ORDER = ['home','history','learn','settings'];
let currentPageId = 'home';

function goPage(id) {
  stopAudio();
  const prev = currentPageId;
  currentPageId = id;

  const prevEl = document.getElementById('page-' + prev);
  const nextEl = document.getElementById('page-' + id);
  if (!nextEl) return;

  // Determine direction: forward = slide right in, backward = slide left in
  const prevIdx = PAGE_ORDER.indexOf(prev);
  const nextIdx = PAGE_ORDER.indexOf(id);
  const isMainNav = prevIdx !== -1 && nextIdx !== -1;
  const forward = !isMainNav || nextIdx >= prevIdx;

  // Render content before showing (avoid flash)
  if (id === 'home') renderHome();
  if (id === 'history') { histSearchQuery = ''; histFilter = 'all'; renderHistory(); }
  if (id === 'learn') renderLearn();
  if (id === 'settings') renderSettings();

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active','slide-in-right','slide-in-left','slide-out-right','slide-out-left');
    if (p !== prevEl && p !== nextEl) p.style.display = 'none';
  });

  // Animate out previous page (only for main nav transitions)
  if (prevEl && prevEl !== nextEl && isMainNav) {
    prevEl.style.display = 'block';
    prevEl.classList.add(forward ? 'slide-out-left' : 'slide-out-right');
    setTimeout(() => {
      prevEl.style.display = 'none';
      prevEl.classList.remove('slide-out-left','slide-out-right');
    }, 220);
  } else if (prevEl && prevEl !== nextEl) {
    prevEl.style.display = 'none';
  }

  // Animate in new page
  nextEl.style.display = 'block';
  nextEl.classList.add('active', isMainNav ? (forward ? 'slide-in-right' : 'slide-in-left') : 'slide-in-right');
  setTimeout(() => {
    nextEl.classList.remove('slide-in-right','slide-in-left');
  }, 280);

  // Scroll to top
  window.scrollTo(0, 0);

  // Update nav indicators
  const m = { home: 0, history: 1, learn: 2, settings: 3 };
  document.querySelectorAll('.nav-pill').forEach((t, i) => t.classList.toggle('active', m[id] === i));
  ['home','history','learn','settings'].forEach(n => {
    const t = document.getElementById('mtab-' + n);
    if (t) t.classList.toggle('active', n === id);
  });
}

// ══════════════════════════════════════════════════
// MOOD TREND CHART
// ══════════════════════════════════════════════════
let moodChartInstance = null;

function renderMoodChart() {
  const wrap = document.getElementById('mood-chart-wrap');
  if (!wrap) return;

  const es = getEntries().filter(e => e.mood_before != null || e.mood_after != null);
  if (es.length < 2) { wrap.innerHTML = ''; return; }

  // Take last 30 entries with mood data, chronological
  const data = [...es].reverse().slice(-30);

  // Summary averages
  const withBefore = data.filter(e => e.mood_before != null);
  const withAfter  = data.filter(e => e.mood_after  != null);
  const withBoth   = data.filter(e => e.mood_before != null && e.mood_after != null);
  const avgBefore  = withBefore.length ? (withBefore.reduce((s,e)=>s+e.mood_before,0)/withBefore.length).toFixed(1) : null;
  const avgAfter   = withAfter.length  ? (withAfter.reduce((s,e)=>s+e.mood_after,0)/withAfter.length).toFixed(1)   : null;
  const avgLift    = withBoth.length   ? (withBoth.reduce((s,e)=>s+(e.mood_after-e.mood_before),0)/withBoth.length).toFixed(1) : null;

  const avgTiles = `
    <div class="mood-avg-row">
      <div class="mood-avg-tile">
        <span class="mood-avg-val">${avgBefore!=null?MOODS[Math.round(avgBefore)].e:'—'}</span>
        <span class="mood-avg-key">Avg before</span>
      </div>
      <div class="mood-avg-tile">
        <span class="mood-avg-val">${avgAfter!=null?MOODS[Math.round(avgAfter)].e:'—'}</span>
        <span class="mood-avg-key">Avg after</span>
      </div>
      <div class="mood-avg-tile">
        <span class="mood-avg-val" style="font-size:18px;color:${avgLift>0?'var(--sage)':avgLift<0?'var(--red)':'var(--ink-60)'};">${avgLift!=null?(avgLift>0?'+':'')+avgLift:'—'}</span>
        <span class="mood-avg-key">Avg lift</span>
      </div>
    </div>`;

  wrap.innerHTML = `
    <div class="mood-chart-card">
      <div class="mood-chart-title">Mood over time</div>
      <div class="mood-chart-sub">How you felt before and after each session</div>
      ${avgTiles}
      <div class="mood-chart-wrap"><canvas id="mood-canvas"></canvas></div>
      <div class="mood-chart-legend">
        <div class="mood-legend-item"><div class="mood-legend-dot" style="background:#7BBDA4;"></div>Before session</div>
        <div class="mood-legend-item"><div class="mood-legend-dot" style="background:#2D7A5F;"></div>After session</div>
      </div>
    </div>`;

  const labels = data.map(e => new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}));
  const beforeData = data.map(e => e.mood_before != null ? e.mood_before + 1 : null);
  const afterData  = data.map(e => e.mood_after  != null ? e.mood_after  + 1 : null);

  if (moodChartInstance) { moodChartInstance.destroy(); moodChartInstance = null; }

  const ctx = document.getElementById('mood-canvas').getContext('2d');

  // Gradient fills
  const gBefore = ctx.createLinearGradient(0,0,0,140);
  gBefore.addColorStop(0,'rgba(123,189,164,0.25)');
  gBefore.addColorStop(1,'rgba(123,189,164,0)');
  const gAfter = ctx.createLinearGradient(0,0,0,140);
  gAfter.addColorStop(0,'rgba(45,122,95,0.2)');
  gAfter.addColorStop(1,'rgba(45,122,95,0)');

  moodChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Before',
          data: beforeData,
          borderColor: '#7BBDA4',
          backgroundColor: gBefore,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#7BBDA4',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          tension: 0.4,
          fill: true,
          spanGaps: true,
        },
        {
          label: 'After',
          data: afterData,
          borderColor: '#2D7A5F',
          backgroundColor: gAfter,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#2D7A5F',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          tension: 0.4,
          fill: true,
          spanGaps: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              if (v == null) return null;
              const mood = MOODS[v - 1];
              return `${ctx.dataset.label}: ${mood.e} ${mood.label}`;
            }
          },
          backgroundColor: '#1C1A17',
          titleColor: '#B5B0A8',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 11 },
          bodyFont: { size: 13 },
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#B5B0A8',
            font: { size: 10 },
            maxTicksLimit: 7,
            maxRotation: 0,
          }
        },
        y: {
          min: 0.5,
          max: 5.5,
          grid: { color: 'rgba(28,26,23,0.05)', drawBorder: false },
          border: { display: false },
          ticks: {
            stepSize: 1,
            color: '#B5B0A8',
            font: { size: 11 },
            callback: v => ['','😔','😕','😐','🙂','😄'][v] || ''
          }
        }
      }
    }
  });
}

// ══════════════════════════════════════════════════
// DAILY REMINDER
// ══════════════════════════════════════════════════
function reminderKey() { return currentUser ? 'gj_reminder_' + currentUser.id : 'gj_reminder'; }

function renderReminderCard() {
  const wrap = document.getElementById('reminder-card-wrap');
  if (!wrap) return;

  const saved = localStorage.getItem(reminderKey());
  const dismissed = localStorage.getItem(reminderKey() + '_dismissed');

  // If dismissed permanently, don't show
  if (dismissed === '1') { wrap.innerHTML = ''; return; }

  // If already set, show a "reminder set" confirmation
  if (saved) {
    wrap.innerHTML = `
      <div class="reminder-card">
        <div class="reminder-icon">🔔</div>
        <div class="reminder-info">
          <div class="reminder-title">Daily reminder set</div>
          <div class="reminder-sub">You have a daily reminder set for <strong>${formatTime(saved)}</strong>. Keep showing up!</div>
        </div>
        <button class="reminder-dismiss" onclick="clearReminder()" title="Remove reminder">✕</button>
      </div>`;
    return;
  }

  // Show the set reminder prompt
  wrap.innerHTML = `
    <div class="reminder-card">
      <div class="reminder-icon">🔔</div>
      <div class="reminder-info">
        <div class="reminder-title">Set a daily reminder</div>
        <div class="reminder-sub">The #1 habit-building tool. Pick a time and we'll add it to your calendar.</div>
        <div class="reminder-set">
          <input type="time" class="reminder-time" id="reminder-time-input" value="08:00"/>
          <button class="reminder-btn" onclick="setReminder()">Add to calendar</button>
        </div>
      </div>
      <button class="reminder-dismiss" onclick="dismissReminder()" title="Dismiss">✕</button>
    </div>`;
}

function formatTime(val) {
  const [h, m] = val.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function setReminder() {
  const input = document.getElementById('reminder-time-input');
  const time = input ? input.value : '08:00';
  const [h, m] = time.split(':').map(Number);
  const displayTime = formatTime(time);

  // Build a calendar URL — works on iOS, Android, and desktop
  // Uses the webcal / data URI approach for broad compatibility
  const now = new Date();
  now.setHours(h, m, 0, 0);
  // If the time has already passed today, start tomorrow
  if (now < new Date()) now.setDate(now.getDate() + 1);

  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const end = new Date(now.getTime() + 10 * 60000); // 10 min duration

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gratitude//Daily Journal//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(now)}`,
    `DTEND:${fmt(end)}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Gratitude — Daily Journal',
    `DESCRIPTION:Time for your daily gratitude journal session. Open the app at ${window.location.origin}`,
    `URL:${window.location.origin}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time for your daily gratitude journal',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gratitude-daily-reminder.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Save the time and update the card
  localStorage.setItem(reminderKey(), time);
  renderReminderCard();
}

function clearReminder() {
  localStorage.removeItem(reminderKey());
  renderReminderCard();
}

function dismissReminder() {
  localStorage.setItem(reminderKey() + '_dismissed', '1');
  document.getElementById('reminder-card-wrap').innerHTML = '';
}

// ══════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════
function renderHome() {
  const h = new Date().getHours();
  const name = currentUser?.user_metadata?.full_name?.split(' ')[0] || '';
  document.getElementById('hero-greeting').textContent = (h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + name : '');
  document.getElementById('hero-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('hero-eyebrow').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const s = streak();
  document.getElementById('nav-streak').textContent = s;
  document.getElementById('st-streak').textContent = s;
  document.getElementById('st-total').textContent = getEntries().length;
  document.getElementById('st-week').textContent = weekCount();
  renderWeeklyReflection();
  renderReminderCard();
  renderHeatmap();
  renderBadges(s);
  renderFreezeCard();
  const es = getEntries().slice(0, 3), el = document.getElementById('recent-entries');
  if (!es.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="40" r="38" fill="#EDF5F1" stroke="#7BBDA4" stroke-width="1.5" stroke-dasharray="4 3"/>
        <path d="M28 50 C28 50 32 34 40 28 C48 34 52 50 52 50" stroke="#2D7A5F" stroke-width="2" stroke-linecap="round" fill="none"/>
        <circle cx="40" cy="26" r="4" fill="#2D7A5F"/>
        <path d="M32 44 Q40 40 48 44" stroke="#7BBDA4" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path d="M34 50 Q40 46 46 50" stroke="#7BBDA4" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.6"/>
      </svg>
      <div class="empty-state-title">Your journal is empty</div>
      <div class="empty-state-sub">Every great journey starts with a single entry. Your first session takes just 5 minutes.</div>
      <button class="empty-state-btn" onclick="beginSession()">Begin your first session →</button>
    </div>`;
    return;
  }
  el.innerHTML = es.map(e => {
    const first = (e.answers || []).find(a => a) || 'No answer recorded';
    const moodStr = e.mood_before != null && e.mood_after != null ? `<span>${MOODS[e.mood_before].e}→${MOODS[e.mood_after].e}</span>` : '';
    return `<div class="recent-card" onclick="goPage('history')"><div class="recent-meta"><span>${new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>${moodStr}</div><div class="recent-text">${esc(first)}</div></div>`;
  }).join('');
  renderMoodChart();
}

// ══════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════
const FIXED_QS_L = ["What is one thing you're genuinely grateful for today?", "Who made a positive difference in your life recently, and why?", "What's something small that brought you joy or comfort today?"];
let editingId = null;

// ── HISTORY SEARCH & FILTER STATE ─────────────────
let histSearchQuery = '';
let histFilter = 'all';

function onHistSearch(val) {
  histSearchQuery = val.trim().toLowerCase();
  const clearBtn = document.getElementById('hist-search-clear');
  if (clearBtn) clearBtn.classList.toggle('visible', val.length > 0);
  renderHistory();
}

function clearHistSearch() {
  histSearchQuery = '';
  const input = document.getElementById('hist-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('hist-search-clear');
  if (clearBtn) clearBtn.classList.remove('visible');
  renderHistory();
}

function setHistFilter(f) {
  histFilter = f;
  // Update chip styles
  ['all','week','month','mood-up','mood-down'].forEach(id => {
    const el = document.getElementById('hf-' + id);
    if (!el) return;
    el.classList.remove('active','mood-active');
    if (id === f) {
      el.classList.add(f.startsWith('mood') ? 'mood-active' : 'active');
    }
  });
  renderHistory();
}

function getFilteredEntries() {
  let es = getEntries();

  // Date filter
  if (histFilter === 'week') {
    const wa = new Date(); wa.setDate(wa.getDate() - 6); wa.setHours(0,0,0,0);
    es = es.filter(e => new Date(e.date) >= wa);
  } else if (histFilter === 'month') {
    const ma = new Date(); ma.setDate(1); ma.setHours(0,0,0,0);
    es = es.filter(e => new Date(e.date) >= ma);
  } else if (histFilter === 'mood-up') {
    es = es.filter(e => e.mood_before != null && e.mood_after != null && e.mood_after > e.mood_before);
  } else if (histFilter === 'mood-down') {
    es = es.filter(e => e.mood_before != null && e.mood_after != null && e.mood_after < e.mood_before);
  }

  // Keyword search
  if (histSearchQuery) {
    es = es.filter(e => {
      const answers = (e.answers || []).join(' ').toLowerCase();
      const questions = (e.questions || []).join(' ').toLowerCase();
      const date = new Date(e.date).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }).toLowerCase();
      return answers.includes(histSearchQuery) || questions.includes(histSearchQuery) || date.includes(histSearchQuery);
    });
  }

  return es;
}

function highlightMatch(text, query) {
  if (!text) return '';
  const safeText = esc(text);
  if (!query) return safeText;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeText.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:rgba(45,122,95,0.15);border-radius:3px;padding:0 2px;color:var(--sage-dark);">$1</mark>');
}

function renderHistory() {
  const allEntries = getEntries();
  const el = document.getElementById('hist-list');
  const ce = document.getElementById('hist-count');
  if (ce) ce.textContent = allEntries.length ? `${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}` : '';

  if (!allEntries.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="16" y="12" width="48" height="58" rx="6" fill="#EDF5F1" stroke="#7BBDA4" stroke-width="1.5"/>
        <rect x="24" y="24" width="32" height="3" rx="1.5" fill="#2D7A5F" opacity="0.4"/>
        <rect x="24" y="32" width="28" height="3" rx="1.5" fill="#2D7A5F" opacity="0.3"/>
        <rect x="24" y="40" width="22" height="3" rx="1.5" fill="#2D7A5F" opacity="0.2"/>
        <circle cx="40" cy="56" r="8" fill="#2D7A5F"/>
        <path d="M36 56 L39 59 L44 53" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="empty-state-title">No entries yet</div>
      <div class="empty-state-sub">Complete your first journal session and it will appear here.</div>
      <button class="empty-state-btn" onclick="beginSession()">Start journaling →</button>
    </div>`;
    return;
  }

  const es = getFilteredEntries();
  const isFiltered = histSearchQuery || histFilter !== 'all';
  const rl = document.getElementById('hist-results-label');
  if (rl) {
    if (isFiltered) {
      rl.innerHTML = `<div class="search-results-label"><span>${es.length} result${es.length !== 1 ? 's' : ''}</span><button class="search-clear-all" onclick="clearHistSearch();setHistFilter('all')">Clear all filters</button></div>`;
    } else {
      rl.innerHTML = '';
    }
  }

  if (!es.length) {
    el.innerHTML = `<div class="search-no-results"><span>🔍</span>No entries match your search.<br>Try different keywords or clear the filters.</div>`;
    return;
  }

  el.innerHTML = es.map(e => {
    const qs = e.questions || FIXED_QS_L;
    const isEditing = editingId === e.id;
    const moodRow = e.mood_before != null || e.mood_after != null
      ? `<div class="hist-moods">${e.mood_before != null ? MOODS[e.mood_before].e : ''}${e.mood_before != null && e.mood_after != null ? '→' : ''}${e.mood_after != null ? MOODS[e.mood_after].e : ''}</div>` : '';

    return `<div class="hist-entry">
      <div class="hist-entry-head">
        <div>
          <div class="hist-date">${new Date(e.date).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</div>
          ${moodRow}
        </div>
        <div class="hist-actions">
          ${isEditing
            ? `<button class="hist-edit-btn" onclick="saveEdit('${e.id}')" style="color:var(--sage);border-color:var(--sage-mid);">Save</button><button class="hist-edit-btn" onclick="cancelEdit()">Cancel</button>`
            : `<button class="hist-edit-btn" onclick="startEdit('${e.id}')">Edit</button><button class="hist-del" onclick="askDelete('${e.id}')">Delete</button>`
          }
        </div>
      </div>
      ${qs.map((q, j) => {
        const ans = (e.answers || [])[j] || '';
        const shareBtn = (!isEditing && ans) ? makeShareBtn(ans, e.date) : '';
        const displayAns = isEditing
          ? '<textarea class="hist-a-edit" id="edit-' + e.id + '-' + j + '">' + esc(ans) + '</textarea>'
          : '<div class="hist-a ' + (ans ? '' : 'blank') + '">' + (ans ? highlightMatch(ans, histSearchQuery) : 'Skipped') + '</div>' + shareBtn;
        return `<div class="hist-qa"><div class="hist-q">${highlightMatch(q, histSearchQuery)}</div>${displayAns}</div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function startEdit(id) { editingId = id; renderHistory(); }
function cancelEdit() { editingId = null; renderHistory(); }
async function saveEdit(id) {
  const e = getEntries().find(x => x.id === id); if (!e) return;
  const qs = e.questions || FIXED_QS_L;
  const newAnswers = qs.map((_, j) => { const ta = document.getElementById(`edit-${id}-${j}`); return ta ? ta.value.trim() : (e.answers || [])[j] || ''; });
  await updateEntry(id, newAnswers);
  editingId = null; renderHistory();
}

// ══════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════
function renderSettings() {
  const u = currentUser;
  if (u) {
    const name = u.user_metadata?.full_name || u.email;
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const av = document.getElementById('profile-avatar'); if (av) av.textContent = initials;
    const pn = document.getElementById('profile-name'); if (pn) pn.textContent = name;
    const pe = document.getElementById('profile-email'); if (pe) pe.textContent = u.email;
  }
  const ki = document.getElementById('key-input'); if (ki && elKey) ki.value = elKey;
  const ks = document.getElementById('key-status'); if (ks) { ks.textContent = elKey ? '✓ Key saved' : ''; ks.className = elKey ? 'key-status ok' : ''; }
  const ds = document.getElementById('data-summary'); if (ds) { const n = getEntries().length; ds.textContent = `${n} journal entr${n === 1 ? 'y' : 'ies'} synced to cloud.`; }
}

// ══════════════════════════════════════════════════
// LEARN
// ══════════════════════════════════════════════════
const LEARN_CONTENT = [
  { id: 'l1', cat: 'Breathing', icon: '🫁', bg: '#EDF5F1', color: '#2D7A5F', title: '4-7-8 Breathing', time: '5 min',
    desc: 'Developed by Dr. Andrew Weil, this technique activates your parasympathetic nervous system and creates calm within minutes.',
    steps: ['Sit comfortably with your back straight. Rest the tip of your tongue against the roof of your mouth, behind your front teeth.','Exhale completely through your mouth, making a whoosh sound.','Close your mouth and inhale quietly through your nose for exactly 4 counts.','Hold your breath for 7 counts.','Exhale completely through your mouth with a whoosh sound for 8 counts.','This completes one cycle. Repeat 3 more times for a total of 4 cycles.','Do this twice a day — once in the morning and once before bed.'],
    tip: '<strong>Why it works:</strong> The extended exhale activates your vagus nerve, triggering a full-body relaxation response. The 8-count exhale forces CO₂ out and slows your heart rate.' },

  { id: 'l2', cat: 'Breathing', icon: '📦', bg: '#EDF5F1', color: '#2D7A5F', title: 'Box Breathing', time: '5 min',
    desc: 'Used by Navy SEALs to stay calm under extreme pressure. Equal counts in all four directions balance your nervous system.',
    steps: ['Sit upright. Relax your shoulders away from your ears.','Exhale all the air out of your lungs to start fresh.','Inhale slowly through your nose for 4 counts, feeling your lungs fill from the bottom up.','Hold your breath for 4 counts. Stay relaxed — do not clench.','Exhale slowly through your mouth for 4 counts, emptying completely.','Hold empty for 4 counts before beginning the next inhale.','Repeat for 4–6 cycles, or about 5 minutes.'],
    tip: '<strong>Use it before:</strong> a difficult conversation, a presentation, a moment of overwhelm, or to transition between work and home.' },

  { id: 'l3', cat: 'Breathing', icon: '🌊', bg: '#EDF5F1', color: '#2D7A5F', title: 'Physiological Sigh', time: '1 min',
    desc: "Stanford's fastest stress-reduction technique — works in just one or two breaths.",
    steps: ['Inhale through your nose until your lungs are about 80% full.','Without exhaling, take a second quick sniff through your nose to top up your lungs completely.','Now release a long, slow exhale through your mouth — let it go completely until your lungs feel empty.','That is one cycle. Do 1–3 rounds.','You will notice your heart rate drop almost immediately after the exhale.'],
    tip: "<strong>Why it works:</strong> The double inhale pops collapsed air sacs and the long exhale dumps CO₂ — your body's fastest stress-off switch." },

  { id: 'l4', cat: 'Mindfulness', icon: '🧘', bg: '#F0EDF7', color: '#5B4A8A', title: '5-4-3-2-1 Grounding', time: '3 min',
    desc: 'Interrupt anxiety by pulling attention fully into the present moment through your five senses.',
    steps: ['Pause wherever you are. Take one slow breath.','Name 5 things you can SEE right now. Look around carefully — include small details like shadows or textures.','Name 4 things you can physically FEEL. Your feet on the floor, clothes on your skin, temperature of the air.','Name 3 things you can HEAR. Listen for background sounds you normally tune out.','Name 2 things you can SMELL. If nothing obvious, simply notice the absence of smell.','Name 1 thing you can TASTE. What is the current taste in your mouth?','Take one more slow breath. Notice how your body feels now versus when you started.'],
    tip: "<strong>When to use:</strong> Overwhelm, panic, or feeling disconnected. Works anywhere — no one will know you're doing it." },

  { id: 'l5', cat: 'Mindfulness', icon: '🔍', bg: '#F0EDF7', color: '#5B4A8A', title: 'Body Scan Meditation', time: '10 min',
    desc: "Release tension you didn't know you were holding. Reduces cortisol and improves sleep.",
    steps: ['Lie down or sit comfortably. Close your eyes. Take 3 slow breaths.','Bring attention to the top of your head. Just notice — warmth, tingling, tightness, or nothing.','Slowly move attention down: forehead, eyes, jaw. Let the jaw drop open slightly.','Continue to neck and shoulders. On an exhale, let them fall heavy.','Move to chest and upper back, then stomach. Notice the rise and fall of each breath.','Continue to hips, thighs, knees, calves, feet, and toes.','If you find tension anywhere, breathe into it — imagine the breath flowing directly there.','End by expanding awareness to your whole body at once. Rest for 1 minute before opening your eyes.'],
    tip: '<strong>For sleep:</strong> Do this lying in bed. The goal is not to do it right — falling asleep during it is a perfectly good outcome.' },

  { id: 'l6', cat: 'Mindfulness', icon: '☁️', bg: '#F0EDF7', color: '#5B4A8A', title: 'Thought Defusion', time: '5 min',
    desc: 'An ACT therapy technique that creates space between you and your thoughts so they lose power over you.',
    steps: ['When a difficult thought appears, notice it. Do not try to push it away or argue with it.','Instead of thinking "I am a failure", try: "I am having the thought that I am a failure."','Take it further: "I notice I am having the thought that I am a failure."','Visualise the thought as a leaf floating down a stream. You are on the bank — watching, not swept along.','Alternatively, say the thought out loud in a silly cartoon voice. The content stays the same but the power dissolves.','Return to the present moment — what can you see, hear, feel right now?','Practice with one recurring negative thought for 5 minutes daily.'],
    tip: '<strong>Key insight:</strong> You are the observer of your thoughts — not the thoughts themselves. A thought is a mental event, not a fact.' },

  { id: 'l7', cat: 'Sleep', icon: '🌙', bg: '#FDF3E3', color: '#9A6520', title: 'Wind-Down Ritual', time: '30 min',
    desc: 'The hour before bed is the most powerful lever for sleep quality.',
    steps: ['Set an alarm for 60 minutes before your intended sleep time. When it goes off, begin winding down.','Dim all lights in your home. Your brain reads bright light as daytime and suppresses melatonin.','Put your phone in another room or enable Do Not Disturb. Respond to nothing after this point.','Do one calming activity: a warm shower, gentle stretching, reading a physical book, or light journaling.','Keep your bedroom temperature cool — 65–68F (18–20C) is optimal for sleep.','If your mind races, write down everything on your mind on paper. This clears mental loops.','Get into bed only when you feel sleepy, not just tired. The bed should be for sleep only.'],
    tip: '<strong>Non-negotiable:</strong> Screens off 30 minutes before bed is more impactful than any supplement. Blue light delays melatonin onset by up to 3 hours.' },

  { id: 'l8', cat: 'Sleep', icon: '🧠', bg: '#FDF3E3', color: '#9A6520', title: 'Cognitive Shuffle', time: '10 min',
    desc: 'A sleep-scientist technique that transitions your brain from analytical thinking to pre-sleep.',
    steps: ['Lie in bed with your eyes closed.','Think of a random, emotionally neutral word — something like "bedside" or "hammock."','Spell out the word letter by letter. For each letter, visualise a random object or scene starting with that letter.','For "B" you might picture a banana. Hold the image a few seconds, then let it drift.','Move to the next letter. The images should be random and disconnected — that is the point.','Do not try to make a story. The more random and non-sequential, the better.','If you catch yourself thinking about your day, gently return to the next letter.'],
    tip: "<strong>Why it works:</strong> Analytical thinking and dream-imagery cannot coexist. Random visual images mimic the hypnagogic state your brain enters naturally before sleep." },

  { id: 'l9', cat: 'Movement', icon: '🤸', bg: '#FDF0EF', color: '#8A3030', title: 'Progressive Muscle Relaxation', time: '10 min',
    desc: 'Clinically proven for reducing anxiety. Tense then release muscle groups to teach your body true relaxation.',
    steps: ['Lie down or sit comfortably. Close your eyes and take 3 slow breaths.','Start with your feet. Curl your toes and tense your foot muscles hard for 5 seconds.','Release completely. Notice the warmth and heaviness of relaxation flooding in.','Move to your calves. Tense for 5 seconds, then release. Pause 10 seconds between each group.','Continue upward: thighs, stomach, chest, hands (make fists), arms, shoulders (shrug to ears), face (scrunch everything).','After each release, spend a moment noticing the sensation of relaxation before moving on.','End with your whole body. Take 3 deep breaths and rest for 2 minutes before getting up.'],
    tip: '<strong>For anxiety:</strong> The physical tension-release teaches your nervous system the difference between tense and relaxed — a skill it needs active practice with.' },

  { id: 'l10', cat: 'Movement', icon: '🚶', bg: '#FDF0EF', color: '#8A3030', title: '10-Minute Walk Reset', time: '10 min',
    desc: 'A single 10-minute walk improves mood for up to 2 hours.',
    steps: ['Leave your phone behind or put it on silent in your pocket. This is not a podcast walk.','Step outside — natural light is part of what makes this work.','Walk at a comfortable pace. Not a workout pace — a thinking pace.','For the first 3 minutes, just notice your body: breathing, stride, temperature.','For the next 4 minutes, let your mind wander freely. Do not direct your thoughts.','For the final 3 minutes, notice your surroundings — 5 things you would not normally observe.','Return. Notice how your mental state compares to before you left.'],
    tip: '<strong>The science:</strong> Walking generates bilateral stimulation (left-right movement) — the same mechanism used in EMDR trauma therapy. It is why you think more clearly while moving.' },

  { id: 'l11', cat: 'Journaling', icon: '✍️', bg: '#E8F4F8', color: '#1E6A8A', title: 'Morning Pages', time: '20 min',
    desc: 'Three pages of longhand stream-of-consciousness writing every morning. Clears mental fog and reduces anxiety.',
    steps: ['Keep a dedicated notebook and pen beside your bed. Do this before looking at your phone.','The moment you wake up, open the notebook and start writing. Do not make coffee first.','Write by hand — not typed. The slower pace of handwriting matches the emerging pace of thought.','Write whatever comes. "I do not know what to write. I am tired." Just keep moving the pen.','Never re-read while writing. Do not edit. Do not cross things out.','Write until you have filled 3 pages — about 20 minutes.','Close the notebook. Do not review it for at least a week. The act of writing, not the content, is the medicine.'],
    tip: '<strong>On bad days:</strong> The days you least want to do it are usually the days it helps most. "I do not want to write" is itself the first sentence.' },

  { id: 'l12', cat: 'Journaling', icon: '🙏', bg: '#E8F4F8', color: '#1E6A8A', title: 'Gratitude Specificity', time: '5 min',
    desc: "Generic gratitude has minimal impact. Hyper-specific gratitude lights up the brain's reward centers differently.",
    steps: ['Open your journal or the Gratitude app. Set a timer for 5 minutes.','Write one thing you are grateful for. Now stop — do not just write it and move on.','Ask: why am I grateful for this specifically today? What would be different without it?','Instead of "I am grateful for my health," write what specifically your health allowed you to do today.','Go deeper: who made this possible? What chain of events led to this thing existing in your life?','Try to feel the gratitude in your body — where do you notice warmth or fullness?','One hyper-specific entry rewires more than ten generic ones.'],
    tip: "<strong>The research:</strong> Seligman's studies show specificity and novelty matter most. Your brain habituates to the same gratitude items — rotate and dig deeper each time." },

  { id: 'l13', cat: 'Journaling', icon: '📝', bg: '#E8F4F8', color: '#1E6A8A', title: 'Expressive Writing', time: '20 min',
    desc: "Psychologist James Pennebaker's research: writing about difficult emotions produces lasting improvements in mental and physical health.",
    steps: ['Choose something difficult — a loss, a conflict, a fear, a regret. Something you have not fully processed.','Set a timer for 20 minutes. Find a private, quiet space.','Write continuously about your deepest thoughts and feelings. Do not worry about grammar or sentences.','Explore why it affected you. What does it mean to you? How does it connect to who you are?','If you cry or feel upset, that is okay. That is the process working.','When the timer ends, stop. You do not need to re-read it. You can throw it away if you want.','Repeat on 3–4 consecutive days, or whenever something feels unresolved.'],
    tip: "<strong>Pennebaker's finding:</strong> Participants had fewer doctor visits, better immune function, and lower anxiety for months afterward. The improvement comes from building a coherent narrative around difficult events." },

  { id: 'l14', cat: 'Mindfulness', icon: '🌿', bg: '#F0EDF7', color: '#5B4A8A', title: 'Mindful Walking', time: '10 min',
    desc: "Turn an ordinary walk into stress relief. Reduces rumination and quiets the brain's default mode network.",
    steps: ['Find a route — even 10 steps back and forth in a small space works. Outside is better.','Begin walking slightly slower than normal.','Focus entirely on the physical sensation of walking: heel contact, weight shift, push off.','When your mind wanders (it will), gently label it — "thinking" — then return to the sensation of your feet.','Expand awareness to include sounds around you, without analysing them. Just hearing.','Include peripheral vision — widen your gaze rather than focusing on a single point.','End by standing still for 30 seconds. Notice the stillness after movement.'],
    tip: '<strong>Unlike regular walking:</strong> The goal is not to go somewhere or think things through. It is to be fully present in the body. Surprisingly difficult at first, and gets easier fast.' },

  { id: 'l15', cat: 'Sleep', icon: '🛁', bg: '#FDF3E3', color: '#9A6520', title: 'The Warm Bath Trick', time: '20 min',
    desc: 'A warm bath 90 minutes before bed paradoxically cools your core temperature — the key trigger for deep sleep.',
    steps: ['Time this for exactly 90 minutes before your intended sleep time.','Run a bath at 40–42C (104–108F) — warm but not uncomfortably hot.','Soak for 10–20 minutes. No phone. Dim the lights.','The warm water draws blood to your skin surface. When you get out, heat dissipates rapidly.','This rapid drop in core temperature mimics the natural drop your body uses to initiate sleep.','Get out and let yourself air-dry or towel off gently. Do not rush back to activity.','Keep the bedroom cool and get into bed within 60–90 minutes.'],
    tip: "<strong>No bath?</strong> A warm foot soak works too — feet are the body's primary heat dissipation points and produce a similar core temperature drop." },

  { id: 'l16', cat: 'Breathing', icon: '🌬️', bg: '#EDF5F1', color: '#2D7A5F', title: 'Alternate Nostril Breathing', time: '7 min',
    desc: 'A foundational yoga practice shown to balance brain hemispheres and lower blood pressure.',
    steps: ['Sit with your spine straight. Rest your left hand on your left knee.','Raise your right hand. Place your index and middle fingers between your eyebrows.','Close your right nostril with your thumb. Inhale through the left nostril for 4 counts.','Close both nostrils. Hold for 2 counts.','Release the right nostril. Exhale through the right for 4 counts.','Inhale through the right nostril for 4 counts. Close both, hold 2 counts. Release left, exhale for 4.','This is one complete cycle. Continue for 5–7 minutes, always switching after the exhale.'],
    tip: '<strong>Research finding:</strong> Alternate nostril breathing reduced systolic blood pressure by an average of 10 points in a 6-week study, and improves focus by balancing brain hemisphere activity.' },

  { id: 'l17', cat: 'Movement', icon: '🙆', bg: '#FDF0EF', color: '#8A3030', title: 'Desk Stretches', time: '5 min',
    desc: 'Stress lives in the body. Release tension that accumulates during stressful days.',
    steps: ['Neck: slowly drop your right ear to your right shoulder. Hold 20 seconds. Switch sides. Then gently roll chin to chest.','Chest opener: interlace fingers behind your back, squeeze shoulder blades, and lift arms slightly. Hold 20 seconds.','Seated spinal twist: hold the back of your chair with both hands and rotate your torso. Hold 20 seconds each side.','Hip flexor: sit on the edge of your chair, extend one leg behind you with the top of your foot on the floor. Hold 30 seconds each side.','Wrist circles: extend both arms, make fists, and rotate 10 times each direction.','Eye reset: look away from your screen and focus on the furthest point you can see for 20 seconds.','End with 3 deep breaths with your eyes closed.'],
    tip: '<strong>Every 90 minutes:</strong> Set a recurring timer. Sitting freezes the psoas muscle — your primary stress-response muscle — which maintains physical tension even when your mind is calm.' },

  { id: 'l18', cat: 'Mindfulness', icon: '🎵', bg: '#F0EDF7', color: '#5B4A8A', title: 'Sound Bath Listening', time: '15 min',
    desc: 'Deliberately listening to calming sound shifts brainwaves from beta (stress) toward alpha and theta (calm, restful).',
    steps: ['Find a comfortable position — lying down is ideal. Use headphones for the best effect.','Choose a sound: binaural beats (delta or theta range), singing bowls, brown noise, or rainfall. YouTube and Spotify have free options.','Set a timer for 15 minutes so you do not have to watch the clock.','Close your eyes and focus entirely on the sound. Not analysing it — just listening.','When thoughts arise, use the sound as an anchor. Return to it as you would return to the breath in meditation.','Notice texture and layers in the sound you would not normally hear.','When the timer ends, sit up slowly and rest for 30 seconds before resuming activity.'],
    tip: '<strong>Binaural beats:</strong> Require headphones to work — each ear receives a slightly different frequency and your brain generates a third tone from the difference, directly entraining brainwave frequency.' },

  { id: 'l19', cat: 'Journaling', icon: '🔮', bg: '#E8F4F8', color: '#1E6A8A', title: 'Future Self Letter', time: '15 min',
    desc: 'Write a letter from your future self looking back at this moment. A powerful perspective tool used in therapy.',
    steps: ['Choose a time horizon: 1 year, 5 years, or 10 years from now.','Imagine your future self — wiser, with the benefit of hindsight. What have they figured out that you have not?','Write a letter that starts: "Dear [your name], I am writing to you from [year]..."','What does your future self want you to know about this period? What were you worrying about that turned out fine?','What were the things that actually mattered? What did you get right?','What would they tell you to stop doing? To start? To stop worrying about?','End with something encouraging. Then read the letter slowly from the beginning.'],
    tip: "<strong>Research backing:</strong> Hal Hershfield's studies show people who feel connected to their future self make better long-term decisions and report higher life satisfaction. This exercise builds that connection." },

  { id: 'l20', cat: 'Movement', icon: '💪', bg: '#FDF0EF', color: '#8A3030', title: 'Shaking Practice', time: '5 min',
    desc: 'Animals shake after stress to discharge adrenaline and cortisol. Humans can reclaim this instinct.',
    steps: ['Stand with feet shoulder-width apart. Bend your knees slightly.','Begin to gently bounce, letting your whole body vibrate. Start small — just your legs.','Allow the vibration to travel up through your hips, belly, chest, shoulders.','Let your arms hang loose and shake. Let your jaw drop open slightly.','After 2 minutes, increase the shaking for 30 seconds — big, free movement.','Then gradually slow down, returning to stillness over 30 seconds.','Stand completely still for 1 minute. Notice the tingling and warmth throughout your body.'],
    tip: "<strong>This works:</strong> Dr. Peter Levine's somatic research shows that animals shake to discharge the freeze response after stress. Humans override this instinct socially, which keeps stress locked in the body." },
];

const CATS = ['All', 'Breathing', 'Mindfulness', 'Sleep', 'Movement', 'Journaling'];
const CAT_COLORS = { Breathing: '#2D7A5F', Mindfulness: '#5B4A8A', Sleep: '#9A6520', Movement: '#8A3030', Journaling: '#1E6A8A' };
const CAT_BG = { Breathing: '#EDF5F1', Mindfulness: '#F0EDF7', Sleep: '#FDF3E3', Movement: '#FDF0EF', Journaling: '#E8F4F8' };

const QUOTES_OF_DAY = [
  { text: 'Gratitude turns what we have into enough.', author: 'Aesop' },
  { text: 'The present moment always will have been.', author: 'Eckhart Tolle' },
  { text: 'Almost everything will work again if you unplug it for a few minutes, including you.', author: 'Anne Lamott' },
  { text: 'Be where you are. Otherwise you will miss your life.', author: 'Buddha' },
  { text: 'The quieter you become, the more you can hear.', author: 'Ram Dass' },
  { text: 'Nothing is worth more than this day.', author: 'Goethe' },
  { text: 'It is not joy that makes us grateful; it is gratitude that makes us joyful.', author: 'David Steindl-Rast' },
  { text: 'Wherever you are, be all there.', author: 'Jim Elliot' },
  { text: 'Begin anywhere.', author: 'John Cage' },
  { text: 'A small daily task, if it be really daily, will beat the labours of a spasmodic Hercules.', author: 'Anthony Trollope' },
  { text: 'Enough is a feast.', author: 'Buddhist proverb' },
  { text: 'The present moment is the door to all moments.', author: 'Thich Nhat Hanh' },
  { text: 'You yourself deserve your love and affection as much as anyone.', author: 'Sharon Salzberg' },
  { text: 'We are more often frightened than hurt; we suffer more in imagination than in reality.', author: 'Seneca' },
  { text: 'It is not what happens to you, but how you react that matters.', author: 'Epictetus' },
  { text: 'The obstacle is the way.', author: 'Marcus Aurelius' },
  { text: 'One day you will look back and see that all along you were blooming.', author: 'Morgan Harper Nichols' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
  { text: 'Every moment is a fresh beginning.', author: 'T.S. Eliot' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'Peace comes from within. Do not seek it without.', author: 'Buddha' },
  { text: 'The only way out is through.', author: 'Robert Frost' },
  { text: 'What you are is what you have been. What you will be is what you do now.', author: 'Buddha' },
  { text: 'You have been assigned this mountain to show others it can be climbed.', author: 'Mel Robbins' },
  { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'Respond; do not react. Listen; do not talk. Think; do not assume.', author: 'Raji Lukkoor' },
  { text: 'To be yourself in a world constantly trying to make you something else is the greatest accomplishment.', author: 'Ralph Waldo Emerson' },
  { text: 'You are allowed to be both a masterpiece and a work in progress.', author: 'Sophia Bush' },
  { text: 'What we think, we become.', author: 'Buddha' },
  { text: 'Showing up consistently is the whole war.', author: 'James Clear' },
  { text: 'Life is what happens when you are busy making other plans.', author: 'John Lennon' },
];

const DAILY_TIPS = [
  { text: 'Before checking your phone this morning, take three slow breaths. You get to choose how your day begins.', cat: 'Mindfulness' },
  { text: 'Tension lives in the body before the mind notices it. Pause and drop your shoulders right now.', cat: 'Movement' },
  { text: 'Name one thing that went well today — no matter how small. Train your brain to notice the good.', cat: 'Journaling' },
  { text: 'The exhale is your emergency brake. Make yours twice as long as your inhale.', cat: 'Breathing' },
  { text: 'A 10-minute walk without your phone is worth more than an hour of anxious scrolling.', cat: 'Movement' },
  { text: 'You do not need to solve everything today. What is one small thing you can do right now?', cat: 'Mindfulness' },
  { text: 'Write down three specific things you are grateful for before you go to sleep tonight.', cat: 'Journaling' },
  { text: 'Screens off 30 minutes before bed is the highest-leverage sleep change you can make tonight.', cat: 'Sleep' },
];
let activeCat = 'All';
let learnDone = JSON.parse(localStorage.getItem('gj_learn_done') || '[]');
function saveDone() { localStorage.setItem('gj_learn_done', JSON.stringify(learnDone)); }

function renderLearn() {
  // Quote of the day — cycles by day of year so it changes daily
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const quote = QUOTES_OF_DAY[dayOfYear % QUOTES_OF_DAY.length];
  const qw = document.getElementById('learn-quote-wrap');
  if (qw) {
    qw.innerHTML = '<div class="learn-quote-card">'
      + '<div class="learn-quote-eyebrow">Quote of the day</div>'
      + '<div class="learn-quote-text">\u201C' + esc(quote.text) + '\u201D</div>'
      + '<div class="learn-quote-author">\u2014 ' + esc(quote.author) + '</div>'
      + '</div>';
  }

  // Daily tip
  const tip = DAILY_TIPS[new Date().getDate() % DAILY_TIPS.length];
  const tw = document.getElementById('learn-tip-wrap');
  if (tw) tw.innerHTML = '<div class="learn-tip"><div class="tip-eyebrow">💡 Tip of the day</div><div class="tip-body">"' + esc(tip.text) + '"</div><div class="tip-category"><span class="tip-dot"></span>' + esc(tip.cat) + '</div></div>';

  const total = LEARN_CONTENT.length, done = learnDone.length, pct = Math.round((done / total) * 100);
  const dl = document.getElementById('learn-done-label'); if (dl) dl.textContent = done + ' of ' + total;
  const lf = document.getElementById('learn-fill'); if (lf) lf.style.width = pct + '%';
  const lp = document.getElementById('learn-pct'); if (lp) lp.textContent = pct + '%';
  const ct = document.getElementById('learn-cat-tabs'); if (ct) ct.innerHTML = CATS.map(c => '<button class="learn-cat-tab ' + (c === activeCat ? 'active' : '') + '" onclick="setLearnCat(\'' + c + '\')">' + c + '</button>').join('');
  const filtered = activeCat === 'All' ? LEARN_CONTENT : LEARN_CONTENT.filter(c => c.cat === activeCat);
  const lc = document.getElementById('learn-cards'); if (!lc) return;
  lc.innerHTML = filtered.map(c => {
    const isDone = learnDone.includes(c.id);
    const col = CAT_COLORS[c.cat] || '#2D7A5F', bg = CAT_BG[c.cat] || '#EDF5F1';
    const steps = c.steps || [];
    const stepsHtml = steps.length
      ? '<ol class="learn-steps">' + steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>'
      : '';
    const tipHtml = c.tip ? '<div class="learn-tip-box">' + c.tip + '</div>' : '';
    return '<div class="learn-card ' + (isDone ? 'completed' : '') + '" id="lc-' + c.id + '">'
      + '<div class="learn-card-header" onclick="toggleLC(\'' + c.id + '\')">'
      + '<div class="learn-card-icon" style="background:' + bg + ';">' + c.icon + '</div>'
      + '<div class="learn-card-info"><div class="learn-card-title">' + esc(c.title) + '</div>'
      + '<div class="learn-card-meta"><span class="learn-card-tag" style="background:' + bg + ';color:' + col + ';">' + c.cat + '</span>· ' + c.time + '</div></div>'
      + '<div class="learn-card-actions">'
      + '<button class="learn-done-btn ' + (isDone ? 'done' : '') + '" onclick="event.stopPropagation();toggleDone(\'' + c.id + '\')">' + (isDone ? '✓' : '') + '</button>'
      + '<button class="learn-expand-btn" onclick="event.stopPropagation();toggleLC(\'' + c.id + '\')">⌄</button>'
      + '</div></div>'
      + '<div class="learn-card-body" id="lcb-' + c.id + '">'
      + '<div class="learn-card-body-inner"><p class="learn-card-desc">' + esc(c.desc) + '</p>' + stepsHtml + '</div>'
      + tipHtml + '</div></div>';
  }).join('');
}
function setLearnCat(cat) { activeCat = cat; renderLearn(); }
function toggleLC(id) { const card = document.getElementById('lc-' + id); if (card) card.classList.toggle('open'); }
function toggleDone(id) { if (learnDone.includes(id)) learnDone = learnDone.filter(x => x !== id); else learnDone.push(id); saveDone(); renderLearn(); }

// ══════════════════════════════════════════════════
// QUESTIONS
// ══════════════════════════════════════════════════
const POOL = ["What challenge are you thankful for, even if it was difficult?", "What's one thing about yourself you appreciate right now?", "What moment from today would you want to remember forever?", "What opportunity are you most looking forward to?", "Describe something beautiful you noticed today.", "What relationship in your life are you most grateful for, and why?"];
function pickQs() { const s = [...POOL].sort(() => Math.random() - 0.5); return [...FIXED_QS_L, s[0], s[1]]; }

// ══════════════════════════════════════════════════
// BREATHWORK
// ══════════════════════════════════════════════════
const EXERCISES = { box: { name: 'Box Breathing', pattern: '4 in · 4 hold · 4 out · 4 hold', desc: 'Equal counts create perfect nervous system balance.', rounds: 4, phases: [{ w: 'Inhale', d: 4, scale: 1.13, ex: false, narr: 'Breathe in… two… three… four…' }, { w: 'Hold', d: 4, scale: 1.13, ex: false, narr: 'Hold… two… three… four…' }, { w: 'Exhale', d: 4, scale: 0.88, ex: true, narr: 'Breathe out… two… three… four…' }, { w: 'Hold', d: 4, scale: 0.88, ex: true, narr: 'Hold… two… three… four…' }] }, f478: { name: '4-7-8 Breathing', pattern: '4 in · 7 hold · 8 out', desc: 'The extended exhale activates your parasympathetic system.', rounds: 4, phases: [{ w: 'Inhale', d: 4, scale: 1.13, ex: false, narr: 'Breathe in slowly… two… three… four…' }, { w: 'Hold', d: 7, scale: 1.13, ex: false, narr: 'Hold gently… three… four… five… six… seven…' }, { w: 'Exhale', d: 8, scale: 0.88, ex: true, narr: 'Slowly breathe all the way out… five… six… seven… eight…' }] }, belly: { name: 'Belly Breathing', pattern: '5 in · 5 out · 5 rounds', desc: 'Deep diaphragmatic breaths signal safety to your nervous system.', rounds: 5, phases: [{ w: 'Inhale', d: 5, scale: 1.15, ex: false, narr: 'Breathe deep into your belly… two… three… four… five…' }, { w: 'Exhale', d: 5, scale: 0.88, ex: true, narr: 'Slowly release… two… three… four… five…' }] } };
let chosenEx = 'box', bTimer = null, bRound = 0, bPhase = 0, bCount = 0, bGoing = false;
function renderBreathOpts() { const el = document.getElementById('breath-opts'); if (el) el.innerHTML = Object.entries(EXERCISES).map(([k, e]) => `<button class="breath-opt ${k === chosenEx ? 'picked' : ''}" onclick="pickEx('${k}')"><div class="breath-opt-head"><span class="breath-opt-name">${e.name}</span><span class="breath-opt-pill">${e.pattern}</span></div><div class="breath-opt-desc">${e.desc}</div></button>`).join(''); }
function pickEx(k) { chosenEx = k; renderBreathOpts(); }
function launchBreath() { const e = EXERCISES[chosenEx]; document.getElementById('bex-tag').textContent = e.name; document.getElementById('bex-pattern').textContent = e.pattern; resetBreath(); goPage('breathex'); if (voiceOn) say(`Beginning ${e.name}. Press start when ready.`); }
function resetBreath() { bRound = 0; bPhase = 0; bCount = 0; bGoing = false; if (bTimer) clearInterval(bTimer); const g = id => document.getElementById(id); if (g('ring-word')) g('ring-word').textContent = 'Ready'; if (g('ring-count')) g('ring-count').textContent = ''; if (g('bex-hint')) g('bex-hint').textContent = "Press start when you're ready"; const sb = g('bex-start'); if (sb) { sb.disabled = false; sb.textContent = 'Start'; } const r = g('ring'); if (r) { r.style.transform = 'scale(1)'; r.classList.remove('exhale'); } renderRoundDots(); }
function renderRoundDots() { const rounds = EXERCISES[chosenEx].rounds; const el = document.getElementById('round-dots'); if (!el) return; el.innerHTML = Array(rounds).fill(0).map((_, i) => `<div class="round-dot ${i < bRound ? 'lit' : ''}"></div>`).join(''); }
function startBreath() { if (bGoing) return; bGoing = true; const sb = document.getElementById('bex-start'); if (sb) sb.disabled = true; if (voiceOn) say("Let's begin. Follow the circle.", () => setTimeout(runPhase, 500)); else setTimeout(runPhase, 300); }
function runPhase() { const ex = EXERCISES[chosenEx]; if (bRound >= ex.rounds) { finishBreath(); return; } const p = ex.phases[bPhase]; bCount = p.d; const g = id => document.getElementById(id); if (g('ring-word')) g('ring-word').textContent = p.w; if (g('ring-count')) g('ring-count').textContent = bCount; if (g('ring')) { g('ring').style.transform = `scale(${p.scale})`; g('ring').classList.toggle('exhale', p.ex); } if (g('bex-hint')) g('bex-hint').textContent = `Round ${bRound + 1} of ${ex.rounds}`; const go = () => { bTimer = setInterval(() => { bCount--; const bc = document.getElementById('ring-count'); if (bc) bc.textContent = bCount > 0 ? bCount : ''; if (bCount <= 0) { clearInterval(bTimer); bPhase++; if (bPhase >= ex.phases.length) { bPhase = 0; bRound++; renderRoundDots(); } setTimeout(runPhase, 400); } }, 1000); }; if (voiceOn) say(p.narr, go); else go(); }
function finishBreath() { bGoing = false; const g = id => document.getElementById(id); if (g('ring-word')) g('ring-word').textContent = 'Done'; if (g('ring-count')) g('ring-count').textContent = ''; if (g('bex-hint')) g('bex-hint').textContent = 'Beautifully done.'; if (g('ring')) g('ring').style.transform = 'scale(1)'; if (voiceOn) say("Beautiful. Carry this calm into your journal.", () => goMoodBefore()); else setTimeout(goMoodBefore, 1200); }
function skipToJournal() { stopAudio(); if (bTimer) clearInterval(bTimer); bGoing = false; goMoodBefore(); }

// ══════════════════════════════════════════════════
// SESSION FLOW
// ══════════════════════════════════════════════════
let sessionQs = [], qIdx = 0, qAnswers = [], inputMode = 'voice';
function beginSession() { moodBefore = null; moodAfter = null; sessionQs = pickQs(); qIdx = 0; qAnswers = Array(sessionQs.length).fill(''); inputMode = 'voice'; renderBreathOpts(); goPage('breath'); }
function goMoodBefore() { renderMoodPicker('mood-emojis-before', 'mood-label-before'); document.getElementById('mood-label-before').textContent = ''; document.getElementById('mood-before-next').disabled = true; goPage('mood-before'); }
function confirmMoodBefore() { goPage('journal'); renderQ(); }
function skipMood() { moodBefore = null; goPage('journal'); renderQ(); }
function goMoodAfter() { renderMoodPicker('mood-emojis-after', 'mood-label-after'); document.getElementById('mood-label-after').textContent = ''; document.getElementById('mood-after-next').disabled = true; goPage('mood-after'); }
function confirmMoodAfter() { finishSession(); }
function skipMoodAfter() { moodAfter = null; finishSession(); }

// ══════════════════════════════════════════════════
// JOURNAL
// ══════════════════════════════════════════════════
let rec = null, recOn = false;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function renderQ() {
  stopAudio();
  const saved = qAnswers[qIdx];
  const segs = sessionQs.map((_, i) => `<div class="progress-seg ${i < qIdx ? 'done' : i === qIdx ? 'now' : ''}"></div>`).join('');
  const voiceUI = `<div class="mic-wrap"><div class="mic-ring" id="mic-ring" onclick="toggleRec()"><svg class="mic-svg" viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 9a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V23h-2v-2.06A9 9 0 0 1 3 12h2z"/></svg></div><span class="mic-status" id="mic-status">${saved ? 'Tap to re-record' : 'Tap to speak'}</span></div><div class="answer-display ${saved ? '' : 'blank'}" id="answer-display">${saved || 'Your answer will appear here as you speak…'}</div>`;
  const typeUI = `<textarea class="answer-textarea" id="type-area" placeholder="Write your thoughts here…" oninput="qAnswers[qIdx]=this.value">${saved || ''}</textarea>`;
  document.getElementById('journal-inner').innerHTML = `<div class="progress-track">${segs}</div><div class="q-card"><div class="q-meta"><span class="q-label">Question ${qIdx + 1} of ${sessionQs.length}</span><button class="q-read-btn" id="read-btn" onclick="readQ()">🔊 Read aloud</button></div><div class="q-text">${sessionQs[qIdx]}</div></div><div class="mode-switcher"><button class="mode-pill ${inputMode === 'voice' ? 'on' : ''}" onclick="setMode('voice')">🎙 Speak</button><button class="mode-pill ${inputMode === 'type' ? 'on' : ''}" onclick="setMode('type')">⌨️ Type</button></div><div id="input-zone">${inputMode === 'voice' ? voiceUI : typeUI}</div><div class="btn-row" style="margin-top:1.5rem;"><button class="btn" id="skip-btn" onclick="skipQ()">Skip</button><button class="btn solid" id="next-btn" onclick="nextQ()">${qIdx < sessionQs.length - 1 ? 'Next →' : 'Finish'}</button></div>`;
  if (voiceOn) setTimeout(() => tts(sessionQs[qIdx]), 300);
}
function readQ() { const b = document.getElementById('read-btn'); if (b) b.classList.add('reading'); tts(sessionQs[qIdx], () => { const b2 = document.getElementById('read-btn'); if (b2) b2.classList.remove('reading'); }); }
function setMode(m) { if (inputMode === 'type') { const ta = document.getElementById('type-area'); if (ta) qAnswers[qIdx] = ta.value; } if (recOn) stopRec(); inputMode = m; renderQ(); }
function toggleRec() { if (!SR) { alert('Voice recording requires Chrome or Edge.'); return; } recOn ? stopRec() : startRec(); }
function startRec() { stopAudio(); rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US'; rec.onstart = () => { recOn = true; const r = document.getElementById('mic-ring'); if (r) r.classList.add('live'); const s = document.getElementById('mic-status'); if (s) { s.textContent = 'Recording… tap to stop'; s.classList.add('recording'); } const nb = document.getElementById('next-btn'); if (nb) nb.disabled = true; const sb = document.getElementById('skip-btn'); if (sb) sb.disabled = true; }; rec.onresult = (e) => { let fin = qAnswers[qIdx] || '', int = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += (fin ? ' ' : '') + e.results[i][0].transcript; else int += e.results[i][0].transcript; } qAnswers[qIdx] = fin; const ad = document.getElementById('answer-display'); if (ad) { ad.classList.remove('blank'); ad.textContent = fin + (int ? ' ' + int : ''); } }; rec.onend = () => { recOn = false; const r = document.getElementById('mic-ring'); if (r) r.classList.remove('live'); const s = document.getElementById('mic-status'); if (s) { s.textContent = qAnswers[qIdx] ? 'Tap to continue speaking' : 'Tap to speak'; s.classList.remove('recording'); } const nb = document.getElementById('next-btn'); if (nb) nb.disabled = false; const sb = document.getElementById('skip-btn'); if (sb) sb.disabled = false; const ad = document.getElementById('answer-display'); if (ad) { if (!qAnswers[qIdx]) { ad.classList.add('blank'); ad.textContent = 'Your answer will appear here as you speak…'; } else { ad.classList.remove('blank'); ad.textContent = qAnswers[qIdx]; } } }; rec.onerror = (e) => { if (e.error !== 'aborted') { recOn = false; renderQ(); } }; rec.start(); }
function stopRec() { if (rec) { rec.stop(); rec = null; } }
function nextQ() { if (recOn) return; if (inputMode === 'type') { const ta = document.getElementById('type-area'); if (ta) qAnswers[qIdx] = ta.value; } if (qIdx < sessionQs.length - 1) { qIdx++; renderQ(); } else { goMoodAfter(); } }
function skipQ() { if (recOn) return; if (inputMode === 'type') { const ta = document.getElementById('type-area'); if (ta) qAnswers[qIdx] = ta.value; } nextQ(); }

async function finishSession() {
  stopAudio();
  const entry = { date: new Date().toISOString(), questions: [...sessionQs], answers: [...qAnswers], moodBefore, moodAfter };
  const ok = await saveEntry(entry);
  if (!ok) {
    // Save failed — show error on journal page rather than fake celebration
    const inner = document.getElementById('journal-inner');
    if (inner) inner.innerHTML = `<div style="text-align:center;padding:3rem 1rem;">
      <div style="font-size:32px;margin-bottom:1rem;">⚠️</div>
      <div style="font-family:var(--font-serif);font-size:20px;font-weight:500;margin-bottom:0.75rem;">Couldn't save your entry</div>
      <p style="color:var(--ink-60);font-size:14px;line-height:1.7;margin-bottom:1.5rem;">There was a problem connecting to the server. Please check your connection and try again. Your answers are still here.</p>
      <button class="btn solid" onclick="finishSession()">Try again</button>
      <button class="btn" style="margin-top:0.75rem;" onclick="goPage('home')">Go home</button>
    </div>`;
    return;
  }
  const saved = cachedEntries[0] || entry;
  renderSummaryPage(saved);
  goPage('summary');
  if (voiceOn) setTimeout(() => say("Well done. Your entry has been saved to the cloud. Take a moment to appreciate yourself for showing up today."), 600);
}

function renderSummaryPage(entry) {
  // Normalize field names — pre-save object uses camelCase, Supabase returns snake_case
  const moodBefore = entry.moodBefore ?? entry.mood_before ?? null;
  const moodAfter  = entry.moodAfter  ?? entry.mood_after  ?? null;

  const date = new Date(entry.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const s = streak();
  const totalEntries = getEntries().length;

  // Personalised message based on streak + mood
  const lift = moodBefore != null && moodAfter != null ? moodAfter - moodBefore : null;
  const messages = [
    { cond: lift >= 2,  msg: "Look at that — you came in one way and you're leaving another. That shift you just felt? That's what this practice creates." },
    { cond: lift === 1, msg: "You showed up, you reflected, and you feel a little better for it. That's the whole point. One entry at a time." },
    { cond: s >= 30,    msg: "Thirty days or more. You've built something real — a practice that belongs to you. The science says your brain is already different for it." },
    { cond: s >= 7,     msg: "A week or more of consistency. Most people never make it this far. You're in the small group that actually shows up." },
    { cond: totalEntries === 1, msg: "Your first entry. The hardest one is always the first. You did something today that your future self will thank you for." },
    { cond: true,       msg: "Every time you pause to reflect, you're rewiring your brain toward gratitude. It doesn't feel dramatic — but it is." },
  ];
  const message = messages.find(m => m.cond).msg;

  // Mood shift display
  let moodShiftHtml = '';
  if (moodBefore != null && moodAfter != null) {
    moodShiftHtml = `<div class="cel-mood-shift">
      <span style="font-size:22px;">${MOODS[moodBefore].e}</span>
      <span class="cel-mood-arrow">→</span>
      <span style="font-size:22px;">${MOODS[moodAfter].e}</span>
      <span style="font-size:13px;color:var(--sage);font-weight:500;margin-left:4px;">${lift > 0 ? '+' + lift + ' mood lift' : lift === 0 ? 'stable' : lift + ' shift'}</span>
    </div>`;
  }

  // Entry answers
  const entriesHtml = entry.questions.map((q, i) => {
    const ans = entry.answers[i];
    const shareBtn = ans ? makeShareBtn(ans, entry.date) : '';
    return '\n    <div class="summary-item">\n      <div class="summary-q-label">Question ' + (i + 1) + '</div>\n      <div class="summary-q">' + esc(q) + '</div>\n      <div class="summary-a ' + (ans ? '' : 'blank') + '">' + (ans ? esc(ans) : 'Skipped') + '</div>\n      ' + shareBtn + '\n    </div>';
  }).join('');

  document.getElementById('summary-inner').innerHTML = `
    <div class="celebration-wrap">
      <div class="cel-check-wrap">
        <svg class="cel-check-svg" viewBox="0 0 36 36" fill="none">
          <path class="cel-check-path" d="M8 18 L15 25 L28 11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="cel-title">Session complete</div>
      <div class="cel-sub">${date}</div>
      <div class="cel-streak-row">
        <div class="cel-stat">
          <span class="cel-stat-val" id="cel-streak-num">0</span>
          <div class="cel-stat-key">Day streak</div>
        </div>
        <div class="cel-stat">
          <span class="cel-stat-val">${totalEntries}</span>
          <div class="cel-stat-key">Total entries</div>
        </div>
      </div>
      ${moodShiftHtml}
      <div class="cel-message">
        <div class="cel-message-text">${message}</div>
      </div>
      <div class="cel-actions">
        <button class="btn" onclick="goPage('history')">View history</button>
        <button class="btn solid" onclick="goPage('home')">Back home &rarr;</button>
      </div>
      <div class="cel-divider"></div>
      <div class="cel-entries-title">Today's reflections</div>
      
      <div class="summary-card" style="animation:fadeUp 0.5s ease 0.9s both;">
        <div class="summary-date-tag">${date}</div>
        ${entriesHtml}
      </div>
    </div>`;

  // Animate streak counter up
  animateCount('cel-streak-num', 0, s, 800);

  // Launch confetti
  launchCelebrationConfetti();
}

function animateCount(elId, from, to, duration) {
  const el = document.getElementById(elId);
  if (!el) return;
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease out cubic
    el.textContent = Math.round(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function launchCelebrationConfetti() {
  const canvas = document.getElementById('cel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#2D7A5F','#7BBDA4','#EDF5F1','#9A6520','#FDF3E3','#1E5C46','#B5B0A8'];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    r: Math.random() * 7 + 3,
    c: colors[Math.floor(Math.random() * colors.length)],
    v: Math.random() * 4 + 2,
    s: Math.random() * 3 - 1.5,
    a: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.15,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    w: Math.random() * 8 + 4,
    h: Math.random() * 5 + 3,
  }));

  let frame = 0;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.y += p.v;
      p.x += p.s;
      p.a += p.spin;
      p.v += 0.05; // gravity
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Slight delay so the page transition completes first
  setTimeout(draw, 400);
}

// ══════════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════════
let delId = null;
function askDelete(id) { delId = id; document.getElementById('del-modal').classList.add('open'); }
function closeModal() { delId = null; document.getElementById('del-modal').classList.remove('open'); }
async function doDelete() {
  if (!delId) return;
  await deleteEntry(delId);
  delId = null; editingId = null;
  closeModal(); renderHistory(); renderHome();
}
document.getElementById('del-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

// ══════════════════════════════════════════════════
function showDeleteAccountModal() {
  const input = document.getElementById('del-account-confirm-input');
  const err = document.getElementById('del-account-err');
  if (input) input.value = '';
  if (err) err.textContent = '';
  document.getElementById('del-account-modal').classList.add('open');
}

function closeDeleteAccountModal() {
  document.getElementById('del-account-modal').classList.remove('open');
}

async function doDeleteAccount() {
  const input = document.getElementById('del-account-confirm-input');
  const err = document.getElementById('del-account-err');
  const btn = document.getElementById('del-account-btn');

  if (!input || input.value.trim().toUpperCase() !== 'DELETE') {
    err.textContent = 'Please type DELETE exactly to confirm.';
    input.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Deleting…';
  err.textContent = '';

  try {
    // 1. Delete all journal entries from Supabase
    if (currentUser) {
      const { error: delErr } = await sb.from('entries').delete().eq('user_id', currentUser.id);
      if (delErr) throw delErr;
    }

    // 2. Clear all local storage keys for this app
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gj_')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Sign out — full auth user deletion requires a server-side admin call.
    // If you add a Netlify function with the service_role key, call it here first.
    await sb.auth.signOut();

    closeDeleteAccountModal();
    alert('Your journal entries and local data have been deleted. Your account has been signed out. If you need your login record fully removed, please contact support.');

  } catch (e) {
    console.error('Account deletion error:', e);
    err.textContent = 'Something went wrong. Please try again or contact support.';
    btn.disabled = false;
    btn.textContent = 'Delete everything';
  }
}

document.getElementById('del-account-modal').addEventListener('click', function(e) {
  if (e.target === this) closeDeleteAccountModal();
});

// ══════════════════════════════════════════════════
// QUOTE CARD
// ══════════════════════════════════════════════════

// Helper — builds share button HTML without nested template literals (Safari compat)
function makeShareBtn(ans, dateRaw) {
  const dateStr = new Date(dateRaw).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const safeAns = JSON.stringify(ans);
  const safeDate = JSON.stringify(dateStr);
  return '<button class="share-quote-btn" onclick="openQuoteCard(' + safeAns + ', ' + safeDate + ')">↗ Share</button>';
}

async function _loadQuoteFonts() {
  if (_quoteFontReady) return;
  // Load Lora into the document font stack so canvas can use it
  const loraRegular = new FontFace('Lora', "url(https://fonts.gstatic.com/s/lora/v35/0QI6MX1D_JOxE7fSYN3Kts3hrQ.woff2)", { weight: '400', style: 'normal' });
  const loraItalic  = new FontFace('Lora', "url(https://fonts.gstatic.com/s/lora/v35/0QI8MX1D_JOxE7fSYN3Kts3lrA.woff2)", { weight: '400', style: 'italic' });
  const loraMedium  = new FontFace('Lora', "url(https://fonts.gstatic.com/s/lora/v35/0QI6MX1D_JOxE7fSYN3Kts3irQ.woff2)", { weight: '500', style: 'normal' });
  try {
    const [f1, f2, f3] = await Promise.all([loraRegular.load(), loraItalic.load(), loraMedium.load()]);
    document.fonts.add(f1); document.fonts.add(f2); document.fonts.add(f3);
    _quoteFontReady = true;
  } catch(e) {
    // Font failed — canvas will fall back to serif
    _quoteFontReady = true;
  }
}

function openQuoteCard(text, date) {
  const modal = document.getElementById('quote-card-modal');
  if (!modal) return;
  modal.dataset.text = text;
  modal.dataset.date = date;
  // Reset preview so spinner shows while canvas draws
  const preview = document.getElementById('quote-card-preview');
  if (preview) preview.src = '';
  modal.classList.add('open');
  // Small delay so modal paint completes before heavy canvas work
  setTimeout(() => renderQuoteCard(text, date), 60);
}

function closeQuoteCard() {
  const modal = document.getElementById('quote-card-modal');
  if (modal) modal.classList.remove('open');
}

// Wrap text to fit canvas width, returning array of lines
function _wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderQuoteCard(text, date) {
  await _loadQuoteFonts();

  const canvas = document.getElementById('quote-card-canvas');
  if (!canvas) return;
  const SIZE = 1080;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme:dark)').matches);

  // ── Background ──
  const bg    = isDark ? '#141210' : '#FAF8F4';
  const card  = isDark ? '#1E1C19' : '#FFFFFF';
  const sage  = '#2D7A5F';
  const sageMid = '#7BBDA4';
  const ink   = isDark ? '#F0EDE8' : '#1C1A17';
  const ink60 = isDark ? '#A09B94' : '#6B6560';
  const ink30 = isDark ? '#5C5751' : '#B5B0A8';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ── Subtle grain overlay ──
  const grainData = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < grainData.data.length; i += 4) {
    const v = Math.random() > 0.5 ? 255 : 0;
    grainData.data[i] = grainData.data[i+1] = grainData.data[i+2] = v;
    grainData.data[i+3] = Math.floor(Math.random() * 8);
  }
  ctx.putImageData(grainData, 0, 0);

  // ── Card shadow + body ──
  const MARGIN = 80;
  const CW = SIZE - MARGIN * 2;
  const CH = SIZE - MARGIN * 2;
  ctx.shadowColor = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(28,26,23,0.10)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = card;
  _roundRect(ctx, MARGIN, MARGIN, CW, CH, 48);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ── Sage top accent bar ──
  ctx.fillStyle = sage;
  _roundRect(ctx, MARGIN, MARGIN, CW, 8, { tl: 48, tr: 48, bl: 0, br: 0 });
  ctx.fill();

  // ── Decorative large quote mark ──
  ctx.font = 'italic 300px Lora, serif';
  ctx.fillStyle = isDark ? 'rgba(61,153,112,0.07)' : 'rgba(45,122,95,0.06)';
  ctx.fillText('\u201C', MARGIN + 56, MARGIN + 320);

  // ── Logo mark (SVG path replicated in canvas) ──
  const LX = MARGIN + 56, LY = MARGIN + 60;
  // Green rounded square
  ctx.fillStyle = sage;
  _roundRect(ctx, LX, LY, 68, 68, 14);
  ctx.fill();
  // Stem
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(LX + 34, LY + 58); ctx.lineTo(LX + 34, LY + 32);
  ctx.stroke();
  // Left leaf
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(LX+34,LY+38); ctx.bezierCurveTo(LX+34,LY+38,LX+22,LY+32,LX+16,LY+21);
  ctx.bezierCurveTo(LX+22,LY+18,LX+32,LY+24,LX+34,LY+38);
  ctx.fill();
  // Right leaf
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(LX+34,LY+34); ctx.bezierCurveTo(LX+34,LY+34,LX+46,LY+28,LX+52,LY+17);
  ctx.bezierCurveTo(LX+46,LY+14,LX+36,LY+20,LX+34,LY+34);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Small lower leaf
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(LX+34,LY+46); ctx.bezierCurveTo(LX+34,LY+46,LX+26,LY+42,LX+22,LY+34);
  ctx.bezierCurveTo(LX+26,LY+32,LX+33,LY+37,LX+34,LY+46);
  ctx.fill();
  ctx.globalAlpha = 1;

  // App name
  ctx.font = '500 32px Lora, serif';
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.fillText('Gratitude', LX + 84, LY + 46);

  // ── Quote text ──
  const QUOTE_X = MARGIN + 72;
  const QUOTE_MAX_W = CW - 144;
  const QUOTE_TOP = MARGIN + 220;

  // Measure and choose font size — shrink if answer is very long
  let fontSize = 52;
  ctx.font = `italic ${fontSize}px Lora, serif`;
  let lines = _wrapText(ctx, text, QUOTE_MAX_W);
  // If more than 7 lines, shrink
  while (lines.length > 7 && fontSize > 34) {
    fontSize -= 4;
    ctx.font = `italic ${fontSize}px Lora, serif`;
    lines = _wrapText(ctx, text, QUOTE_MAX_W);
  }
  // If still too tall at 34, truncate
  if (lines.length > 9) {
    lines = lines.slice(0, 8);
    lines[7] = lines[7].replace(/\s+\S+$/, '') + '…';
  }

  const lineH = fontSize * 1.45;
  const totalH = lines.length * lineH;
  // Vertically center the quote block between logo area and footer
  const FOOTER_TOP = SIZE - MARGIN - 130;
  const quoteBlock = Math.min(QUOTE_TOP, FOOTER_TOP - totalH - 40);
  const quoteY = quoteBlock + (FOOTER_TOP - quoteBlock - totalH) / 2;

  ctx.fillStyle = ink;
  ctx.font = `italic ${fontSize}px Lora, serif`;
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, QUOTE_X, quoteY + i * lineH);
  });

  // ── Sage underline accent ──
  const underlineY = quoteY + totalH + 32;
  ctx.fillStyle = sage;
  ctx.fillRect(QUOTE_X, underlineY, 72, 4);

  // ── Date attribution ──
  ctx.font = '400 28px Lora, serif';
  ctx.fillStyle = ink60;
  ctx.textAlign = 'left';
  ctx.fillText('— ' + date, QUOTE_X, underlineY + 52);

  // ── Footer divider ──
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,26,23,0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN + 56, FOOTER_TOP);
  ctx.lineTo(SIZE - MARGIN - 56, FOOTER_TOP);
  ctx.stroke();

  // ── Footer: CTA ──
  ctx.font = '400 26px Lora, serif';
  ctx.fillStyle = ink30;
  ctx.textAlign = 'left';
  ctx.fillText('5 minutes of gratitude, every day.', MARGIN + 56, FOOTER_TOP + 52);

  ctx.font = '500 26px Lora, serif';
  ctx.fillStyle = sageMid;
  ctx.textAlign = 'right';
  ctx.fillText('gratitudeapp.netlify.app', SIZE - MARGIN - 56, FOOTER_TOP + 52);

  // Update preview
  const preview = document.getElementById('quote-card-preview');
  if (preview) {
    preview.src = canvas.toDataURL('image/png');
  }
}

// Canvas rounded rect helper (supports per-corner radii)
function _roundRect(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = { tl: r, tr: r, bl: r, br: r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

async function shareOrDownloadQuoteCard() {
  const canvas = document.getElementById('quote-card-canvas');
  if (!canvas) return;

  const btn = document.getElementById('quote-share-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }

  try {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], 'gratitude-quote.png', { type: 'image/png' });

    // Try Web Share API first (mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'My Gratitude Journal',
        text: 'A reflection from my daily gratitude journal.'
      });
    } else {
      // Desktop fallback — trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gratitude-quote.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch(e) {
    if (e.name !== 'AbortError') console.warn('Share failed:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↗ Share'; }
  }
}

// Close on backdrop click
document.addEventListener('click', e => {
  const modal = document.getElementById('quote-card-modal');
  if (modal && e.target === modal) closeQuoteCard();
});

// ══════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════
initTheme();
initBV();
// Start the app once DOM and scripts are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}