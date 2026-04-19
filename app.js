// ══════════════════════════════════════════════════
// SUPABASE INIT
// ══════════════════════════════════════════════════
const SUPABASE_URL = 'https://epfewpuxztzbpzwmvzkx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZmV3cHV4enR6YnB6d212emt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMTU5NzIsImV4cCI6MjA5MDU5MTk3Mn0.tjSyCd3lHEUcSCIbY1VGihO2KUYQ5xg_Dh6bJJAadUA';

// ══════════════════════════════════════════════════
// STRIPE PAYMENTS
// ══════════════════════════════════════════════════
const STRIPE_PK = 'pk_test_51TLDuxPB9SOX4mlDjWu7QZ1OVY6ZeZcufyi6EjCCWZuLL5FtJOq6J5gOwpWDIKBJmsDc5wTxgP7On1f4UCR6Y5gx00udF7DiAw';
const STRIPE_MONTHLY_PRICE = 'price_1TLE6sPB9SOX4mlD49RPklZH';
const STRIPE_YEARLY_PRICE  = 'price_1TLE9VPB9SOX4mlDOs6DghBq';
const TRIAL_DAYS = 3;

// Check if user is in their free trial or has active subscription
function isPremium() {
  const trialStart = localStorage.getItem('gj_trial_start_' + (currentUser?.id || ''));
  if (trialStart) {
    const elapsed = Date.now() - parseInt(trialStart);
    const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
    if (elapsed < trialMs) return true; // still in trial
  }
  return localStorage.getItem('gj_premium_' + (currentUser?.id || '')) === '1';
}

function startTrial() {
  if (!currentUser) return;
  const key = 'gj_trial_start_' + currentUser.id;
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, Date.now().toString());
  }
}

function getTrialDaysLeft() {
  const trialStart = localStorage.getItem('gj_trial_start_' + (currentUser?.id || ''));
  if (!trialStart) return 0;
  const elapsed = Date.now() - parseInt(trialStart);
  const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((trialMs - elapsed) / (24 * 60 * 60 * 1000)));
}

async function openStripeCheckout(priceId) {
  const monthlyLink = 'https://buy.stripe.com/test_aFabJ36KW3fh7Fg6zOffy00';
  const yearlyLink  = 'https://buy.stripe.com/test_cNibJ3fhs2bd2kW9M0ffy01';
  const base = priceId === STRIPE_MONTHLY_PRICE ? monthlyLink : yearlyLink;
  const url = currentUser ? base + '?client_reference_id=' + currentUser.id : base;
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    window.open(url, '_system');
  } else {
    window.open(url, '_blank');
  }
}

function showPaywall() {
  const daysLeft = getTrialDaysLeft();
  const overlay = document.createElement('div');
  overlay.id = 'paywall-overlay';
  overlay.innerHTML = `
    <div class="paywall-inner">
      <div class="paywall-icon">🌱</div>
      <div class="paywall-title">Your free trial has ended</div>
      <div class="paywall-sub">Subscribe to keep journaling and building your practice.</div>
      <div class="paywall-plans">
        <button class="paywall-plan featured" onclick="openStripeCheckout('${STRIPE_MONTHLY_PRICE}')">
          <div class="paywall-plan-name">Monthly</div>
          <div class="paywall-plan-price">$4.99<span>/month</span></div>
          <div class="paywall-plan-note">Billed monthly · cancel anytime</div>
        </button>
        <button class="paywall-plan" onclick="openStripeCheckout('${STRIPE_YEARLY_PRICE}')">
          <div class="paywall-plan-badge">Save 43%</div>
          <div class="paywall-plan-name">Annual</div>
          <div class="paywall-plan-price">$34.99<span>/year</span></div>
          <div class="paywall-plan-note">That's $2.92/month</div>
        </button>
      </div>
      <button class="paywall-restore" onclick="restorePurchase()">I've already subscribed → Unlock</button>
      <div class="paywall-legal">By subscribing you agree to our <a href="https://builtbyricky.github.io/Gratitude-app/terms.html" target="_blank">Terms</a> and <a href="https://builtbyricky.github.io/Gratitude-app/privacy.html" target="_blank">Privacy Policy</a>.</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hidePaywall() {
  const el = document.getElementById('paywall-overlay');
  if (el) el.remove();
}

async function testPaywall() {
  // Simulate trial ended by setting trial_end to past
  if (currentUser && sb) {
    await sb.from('subscriptions')
      .update({ trial_end: new Date(Date.now() - 1000).toISOString() })
      .eq('user_id', currentUser.id);
  }
  showPaywall();
}

async function resetTrial() {
  if (currentUser && sb) {
    await sb.from('subscriptions')
      .update({
        status: 'trial',
        trial_end: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('user_id', currentUser.id);
    hidePaywall();
    alert('Trial reset successfully.');
  }
}

async function restorePurchase() {
  const confirmed = confirm('After completing payment in your browser, tap OK to verify your subscription.');
  if (!confirmed) return;
  // Recheck from Supabase
  try {
    const { data } = await sb
      .from('subscriptions')
      .select('status')
      .eq('user_id', currentUser.id)
      .single();
    if (data?.status === 'active') {
      hidePaywall();
      alert('✓ Subscription verified! Welcome to Gratitude Premium.');
    } else {
      alert('We could not verify your subscription yet. Please wait a few minutes and try again, or contact gratitudejournaling101@gmail.com');
    }
  } catch(e) {
    alert('Could not verify. Please contact gratitudejournaling101@gmail.com');
  }
}

// Check subscription status from Supabase — cannot be faked by users
async function checkPremiumAccess() {
  if (!currentUser || !sb) return;
  try {
    const { data, error } = await sb
      .from('subscriptions')
      .select('status, trial_end, current_period_end')
      .eq('user_id', currentUser.id)
      .single();

    if (error || !data) {
      // No subscription record — create trial
      await sb.from('subscriptions').insert({
        user_id: currentUser.id,
        status: 'trial',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
      });
      return; // Still in trial
    }

    const now = new Date();
    if (data.status === 'active') return; // Paid subscriber — all good
    if (data.status === 'trial') {
      const trialEnd = new Date(data.trial_end);
      if (now < trialEnd) return; // Still in trial
      // Trial expired — show paywall
      showPaywall();
      return;
    }
    // Any other status (cancelled, past_due, etc.) — show paywall
    showPaywall();
  } catch(e) {
    console.log('Premium check error:', e.message);
    // On error fall back to localStorage to avoid blocking legitimate users
    if (!isPremium()) showPaywall();
  }
}



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
    if (document.getElementById('page-home').classList.contains('active')) {
      renderHome();
    }
  });
  // Check premium access — show paywall if trial ended
  setTimeout(() => checkPremiumAccess(), 1500);

  // Request notification permission on first launch (after short delay so UI settles)
  if (!localStorage.getItem('gj_notif_asked')) {
    setTimeout(() => requestNotifPermission(), 2000);
  } else if (localStorage.getItem('gj_notif_enabled')) {
    // Reschedule notifications to refresh the pool (runs silently in background)
    setTimeout(() => refreshNotifSchedule(), 3000);
  }

  // Ask for Apple Health permission on first launch (after notifications settle)
  if (!localStorage.getItem('gj_health_asked_' + currentUser.id)) {
    setTimeout(() => promptHealthOnFirstLaunch(), 4500);
  }

  // Show "What's New" tour for returning users if they've missed recent features
  setTimeout(() => maybeShowWhatsNew(), 2500);

  // Set up shake-to-capture (delayed so it doesn't fire during sign-in animation)
  setTimeout(() => initShakeDetection(), 2000);
}

async function refreshNotifSchedule() {
  try {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
    if (!LocalNotifications) return;
    const current = await LocalNotifications.checkPermissions();
    if (current.display !== 'granted') return;
    const timeStr = localStorage.getItem('gj_notif_time') || '20:00';
    const [h, m] = timeStr.split(':').map(Number);
    await scheduleLocalNotif(LocalNotifications, h, m);
  } catch(e) { /* silently ignore */ }
}

async function requestNotifPermission() {
  try {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications; if (!LocalNotifications) throw new Error('LocalNotifications plugin not available');
    // Check current status first
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') {
      // Already granted — just schedule if not done yet
      if (!localStorage.getItem('gj_notif_enabled')) {
        await scheduleLocalNotif(LocalNotifications, 20, 0);
        localStorage.setItem('gj_notif_enabled', '1');
        localStorage.setItem('gj_notif_time', '20:00');
      }
      localStorage.setItem('gj_notif_asked', '1');
      return;
    }
    if (current.display === 'denied') {
      localStorage.setItem('gj_notif_asked', '1');
      return;
    }
    // Prompt — iOS will show the native permission dialog
    const perm = await LocalNotifications.requestPermissions();
    localStorage.setItem('gj_notif_asked', '1');
    if (perm.display === 'granted') {
      await scheduleLocalNotif(LocalNotifications, 20, 0);
      localStorage.setItem('gj_notif_enabled', '1');
      localStorage.setItem('gj_notif_time', '20:00');
      const ns = document.getElementById('notif-status');
      if (ns) ns.textContent = '✓ Daily reminders enabled at 8:00 PM';
    }
  } catch(e) { /* silently ignore — not on native */ }
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

function toggleSignupBtn() {
  const cb = document.getElementById('legal-consent');
  const btn = document.getElementById('signup-btn');
  if (!btn) return;
  btn.disabled = !cb?.checked;
  btn.style.opacity = cb?.checked ? '1' : '0.5';
}

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
// ══════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════
let obIdx = 0;
let userGoal = localStorage.getItem('gj_goal') || null;

function showOnboarding() {
  obIdx = 0;
  document.getElementById('screen-onboard').classList.add('active');
  document.querySelectorAll('.ob-step').forEach((s, i) => s.classList.toggle('active', i === 0));
}

function selectGoal(btn) {
  document.querySelectorAll('.ob-goal-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  userGoal = btn.dataset.goal;
  localStorage.setItem('gj_goal', userGoal);
  const next = document.getElementById('ob-goal-next');
  if (next) { next.disabled = false; next.style.opacity = '1'; }
}

const GOAL_PLANS = {
  stress: {
    icon: '😮‍💨',
    title: 'Your Anti-Stress Plan',
    body: "Built specifically to help you decompress, ground, and find calm in the middle of overwhelm.",
    items: [
      { icon: '🫁', text: 'Box & 4-7-8 breathing — fastest stress-off switch' },
      { icon: '🎯', text: '30 stress-specific reflection prompts' },
      { icon: '🧠', text: 'Body scan, RAIN, and self-compassion techniques' },
      { icon: '📊', text: 'Mood tracking to see what\'s working' },
    ],
  },
  gratitude: {
    icon: '🙏',
    title: 'Your Gratitude Plan',
    body: 'Designed to rewire your brain toward what is going right, not just what is missing.',
    items: [
      { icon: '🌱', text: '30 gratitude-specific reflection prompts' },
      { icon: '🏆', text: '7-Day Gratitude Challenge' },
      { icon: '📅', text: '"On This Day" memories from past entries' },
      { icon: '🔥', text: 'Streak tracking to build the habit' },
    ],
  },
  clarity: {
    icon: '🔮',
    title: 'Your Clarity Plan',
    body: 'Cut through mental fog and learn what your honest self has been trying to tell you.',
    items: [
      { icon: '💭', text: '30 clarity-focused reflection prompts' },
      { icon: '✨', text: 'Single-tasking & focus techniques' },
      { icon: '🗺️', text: 'Values clarification exercises' },
      { icon: '📝', text: 'Weekly review framework' },
    ],
  },
  growth: {
    icon: '🌱',
    title: 'Your Growth Plan',
    body: 'A structured practice for becoming the person you are working to become.',
    items: [
      { icon: '🌳', text: '30 personal-growth reflection prompts' },
      { icon: '✍️', text: 'Future Self letters & values exercises' },
      { icon: '🏔️', text: 'Cold exposure & resilience techniques' },
      { icon: '📈', text: 'Milestone badges to mark your progress' },
    ],
  },
};

function renderGoalPlan() {
  const goal = localStorage.getItem('gj_goal');
  const plan = GOAL_PLANS[goal];
  if (!plan) return;
  const iconEl = document.getElementById('ob-plan-icon');
  const titleEl = document.getElementById('ob-plan-title');
  const bodyEl = document.getElementById('ob-plan-body');
  const listEl = document.getElementById('ob-plan-list');
  if (iconEl) iconEl.textContent = plan.icon;
  if (titleEl) titleEl.textContent = plan.title;
  if (bodyEl) bodyEl.textContent = plan.body;
  if (listEl) {
    listEl.innerHTML = plan.items.map(item => `
      <div class="ob-plan-item">
        <span class="ob-plan-item-icon">${item.icon}</span>
        <span class="ob-plan-item-text">${item.text}</span>
      </div>
    `).join('');
  }
}

function obNext() {
  const total = document.querySelectorAll('.ob-step').length;
  if (obIdx >= total - 1) return;
  document.getElementById('ob-' + obIdx).classList.remove('active');
  obIdx++;
  document.getElementById('ob-' + obIdx).classList.add('active');
  // If moving into the personalized plan step, render it
  if (obIdx === 2) renderGoalPlan();
}

async function requestNotifAndFinish() {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      // Use Capacitor Local Notifications — works without a server
      const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications; if (!LocalNotifications) throw new Error('LocalNotifications plugin not available');
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        await scheduleLocalNotif(LocalNotifications);
        localStorage.setItem('gj_notif_enabled', '1');
      }
    } else if ('Notification' in window) {
      const result = await Notification.requestPermission();
      if (result === 'granted') localStorage.setItem('gj_notif_enabled', '1');
    }
  } catch(e) { /* silently ignore */ }
  finishOnboard();
}

function getNotifMessages(hour) {
  const goal = localStorage.getItem('gj_goal') || 'gratitude';
  const currentStreak = streak();
  const isMorning = hour < 12;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening = hour >= 17 && hour < 21;
  const isNight = hour >= 21 || hour < 5;

  // Detect if user has broken a previously-good streak (returns 0 but had entries)
  const es = getEntries();
  const hasEntries = es.length > 0;
  const lastEntryDate = es[0] ? new Date(es[0].date) : null;
  const daysSinceLastEntry = lastEntryDate
    ? Math.floor((Date.now() - lastEntryDate.getTime()) / (24*60*60*1000))
    : null;
  const isComebackUser = currentStreak === 0 && hasEntries && daysSinceLastEntry > 1;

  // Streak tier
  let tier;
  if (currentStreak >= 100) tier = 'legend';
  else if (currentStreak >= 30) tier = 'devoted';
  else if (currentStreak >= 7) tier = 'committed';
  else if (currentStreak >= 3) tier = 'building';
  else if (currentStreak >= 1) tier = 'starting';
  else if (isComebackUser) tier = 'comeback';
  else tier = 'fresh';

  // Title rotates based on tier and time
  const titles = {
    legend:    [`${currentStreak} days strong 🔥`, 'A practice, not a streak', 'You\'ve made this yours'],
    devoted:   [`${currentStreak} day streak 🔥`, 'Keep the fire going', 'Your daily practice'],
    committed: [`Day ${currentStreak + 1} awaits`, `${currentStreak} days in a row`, 'Stay consistent'],
    building:  [`${currentStreak} days strong`, 'Don\'t break the chain', 'Keep building'],
    starting:  ['Day 2 awaits', 'Build the habit', 'Show up again'],
    comeback:  ['We\'re here when you\'re ready', 'A gentle return', 'Welcome back'],
    fresh:     ['Gratitude', 'A moment for you', 'Take 5 minutes'],
  };
  const titlePool = titles[tier];
  const title = titlePool[Math.floor(Date.now() / (24*60*60*1000)) % titlePool.length];

  // Time-of-day specific messages — universal across goals
  const timeMessages = isMorning ? [
    "Start your day with intention. 5 minutes of reflection. 🌅",
    "Before the noise begins — write one thing you're grateful for. 🌿",
    "Morning is the cleanest mind you'll have all day. Use it. ☕",
    "What do you want this day to mean? Write it down. 🌱",
    "First thing in the morning is when your brain is most receptive. ✨",
  ] : isAfternoon ? [
    "Midday check-in — how are you actually doing? 🌿",
    "Pause. Breathe. 5 minutes for yourself. ☀️",
    "Your afternoon dip is real. Reflection helps. 📖",
    "Step away from the day for a moment. Come back to yourself. 🕯️",
  ] : isEvening ? [
    "Your day deserves to be remembered. Open your journal. 🕯️",
    "Before the night winds down — what stood out today? 🌅",
    "Evening reflection sets up tomorrow's clarity. ✨",
    "Today happened. Don't let it disappear. 📝",
  ] : [
    "Before you sleep — write one thing worth remembering. 🌙",
    "Tomorrow you'll wish you'd captured today. Take 5 minutes. 🕯️",
    "Quiet hours are for honest reflection. ✨",
  ];

  // Tier-specific messages
  const tierMessages = {
    legend: [
      `${currentStreak} days. You're proof this practice works. 🔥`,
      "You've built something genuinely rare. Keep going.",
      "Most people can't imagine what you've made yours.",
    ],
    devoted: [
      `${currentStreak} days. Your brain is structurally different from this practice. Keep building. 🧠`,
      `Day ${currentStreak + 1} awaits. You're in the top 1% of consistency.`,
      "The science says this is rewiring you. The mirror will say so soon.",
    ],
    committed: [
      `${currentStreak} days in a row. Most people never make it this far. 🌟`,
      "You're past the hard part. This is becoming you.",
      "A week+ of showing up. The practice is starting to give back.",
    ],
    building: [
      `${currentStreak} days. Don't break the chain — you're so close to a week. 🌱`,
      "The first week is the hardest. You're almost there.",
      `Day ${currentStreak + 1} starts your real practice. Don't skip it.`,
    ],
    starting: [
      "Yesterday counts. Make today count too. 🌿",
      "Two days in a row is more than most people manage. Keep going. ✨",
      "The pattern starts now. Show up.",
    ],
    comeback: [
      `It's been ${daysSinceLastEntry} days. No judgment. Come back. 💙`,
      "Streak broken. Practice doesn't break. Open your journal. 🌿",
      "You're not starting from zero. You're starting from experience.",
      "The fact that you're seeing this means you still want this. Begin again. ✨",
      "The best time to come back is now. The second best was yesterday.",
    ],
    fresh: [
      "5 minutes. That's all. You've spent longer on less. ✨",
      "The people who journal consistently aren't more disciplined. They just show up. 🌿",
      "Open Gratitude. Just open it. The rest takes care of itself.",
      "Your first entry is the hardest one. Get it over with. 🌱",
    ],
  };

  // Goal-specific messages
  const goalMessages = {
    stress: [
      "Your nervous system needs 5 minutes. You've got this. 🫁",
      "Feeling the weight of the day? Let's set it down together. 🌿",
      "A short reflection now means a calmer mind tonight. 🕯️",
      "Stress shrinks when you name it. Open your journal. 📖",
      "You handled a lot today. Take a moment to acknowledge it. 💙",
      "Breathe. Reflect. Release. Your journal is ready. ✨",
      "Even 3 minutes of reflection rewires your stress response. 🧠",
      "What's one thing from today you can let go of right now? 🍃",
      "Your thoughts deserve more than your head. Write them down. 📝",
      "Anxiety thrives in your head and dies on the page. 🌿",
    ],
    gratitude: [
      "Something good happened today. Don't let it slip away. ✨",
      "Gratitude compounds. Five minutes now pays off all week. 🌱",
      "What made you smile today, even briefly? 🌿",
      "The specific things — not the generic ones. That's where gratitude lives. 📖",
      "Your brain is scanning for problems. Redirect it. 🧠",
      "Name three things. Just three. That's all it takes. 🙏",
      "What ordinary thing do you have that someone else wishes for? 💙",
      "A grateful mind is a stronger mind. Let's build yours. ✨",
      "Don't let a good day go unrecorded. 📝",
      "The more specific your gratitude, the more real it feels. 🌿",
    ],
    clarity: [
      "Your mind is full. Let's empty it onto the page. 📖",
      "What decision have you been avoiding? Name it. 🔮",
      "Five minutes of honest reflection beats hours of rumination. 🧠",
      "What does the clearest part of you already know? ✨",
      "Clarity doesn't come from thinking more. It comes from writing. 📝",
      "What's one thing you need to stop doing? Say it out loud. 🌿",
      "Your journal is the place where confusion becomes direction. 🔮",
      "The answer is usually already there. Writing finds it. 💙",
      "What would the most honest version of you say right now? 📖",
      "Stop carrying it in your head. Put it on paper. ✨",
    ],
    growth: [
      "Who are you becoming? Check in. 🌱",
      "Growth happens in the small moments of reflection. Don't skip this one. 📖",
      "What did today teach you that yesterday couldn't? 🧠",
      "The version of you from a year ago would be proud. Keep going. ✨",
      "Patterns only become visible when you write them down. 📝",
      "What boundary did you hold today — or wish you had? 💙",
      "You are not who you were. Journal the distance. 🌿",
      "Reflection is the difference between experience and wisdom. 📖",
      "What's one thing you did better than you would have a year ago? 🌱",
      "The most important conversation you'll have today is with yourself. ✨",
    ],
  };

  // Build the pool — weighted: tier (high signal), time (high signal), goal (depth), then mix
  const pool = [
    ...tierMessages[tier],
    ...timeMessages,
    ...(goalMessages[goal] || goalMessages.gratitude),
  ];

  return { title, pool };
}

async function scheduleLocalNotif(LocalNotifications, hour = 20, minute = 0) {
  // Cancel existing before rescheduling
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch(e) {}

  const { title, pool } = getNotifMessages(hour);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  // Schedule 30 notifications spread across next 30 days
  // Each fires at the exact chosen time and never repeats the same message
  // On iOS, schedule: { on: { hour, minute } } repeats daily forever — but only allows 1 message
  // So we use 30 individual dates for message variety, and reschedule when app opens
  const notifications = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    d.setHours(hour, minute, 0, 0);
    notifications.push({
      id: 1000 + i,
      title,
      body: shuffled[i % shuffled.length],
      schedule: { at: d, allowWhileIdle: true },
      sound: 'default',
    });
  }
  await LocalNotifications.schedule({ notifications });

  // Also schedule a single repeating notification as backup — fires daily forever
  // This ensures the user still gets reminded even after 30 days without opening the app
  try {
    await LocalNotifications.schedule({ notifications: [{
      id: 9999,
      title,
      body: shuffled[0],
      schedule: {
        on: { hour, minute },
        repeats: true,
        allowWhileIdle: true,
      },
      sound: 'default',
    }]});
  } catch(e) { /* repeating schedule may not be supported on all versions */ }
}

async function enableNotifications() {
  const status = document.getElementById('notif-status');
  try {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
      if (status) status.textContent = 'Notifications require the iOS app';
      return;
    }
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications; if (!LocalNotifications) throw new Error('LocalNotifications plugin not available');
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'denied') {
      if (status) status.textContent = 'Go to iPhone Settings → Notifications → Gratitude → Allow';
      return;
    }
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display === 'granted') {
      const t = document.getElementById('settings-notif-time');
      const [h, m] = t ? t.value.split(':').map(Number) : [20, 0];
      await scheduleLocalNotif(LocalNotifications, h, m);
      localStorage.setItem('gj_notif_enabled', '1');
      localStorage.setItem('gj_notif_time', t ? t.value : '20:00');
      localStorage.setItem('gj_notif_asked', '1');
      if (status) status.textContent = '✓ Reminders enabled';
    } else {
      if (status) status.textContent = 'Go to iPhone Settings → Notifications → Gratitude → Allow';
    }
  } catch(e) {
    if (status) status.textContent = 'Error: ' + e.message;
  }
}

async function saveNotifTime() {
  const t = document.getElementById('settings-notif-time');
  const status = document.getElementById('notif-status');
  if (!t) return;
  const [h, m] = t.value.split(':').map(Number);
  localStorage.setItem('gj_notif_time', t.value);
  await rescheduleNotif(h, m);
  if (status) status.textContent = '✓ Reminder time updated to ' + t.value;
}

async function rescheduleNotif(hour, minute) {
  if (!localStorage.getItem('gj_notif_enabled')) return;
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications; if (!LocalNotifications) throw new Error('LocalNotifications plugin not available');
      await scheduleLocalNotif(LocalNotifications, hour, minute);
    }
  } catch(e) {}
}

function finishOnboard() {
  document.getElementById('screen-onboard').classList.remove('active');
  if (currentUser) {
    localStorage.setItem('gj_onboarded_' + currentUser.id, '1');
    localStorage.setItem('gj_onboarded_at_' + currentUser.id, String(Date.now()));
    // Pre-mark the current "What's New" as seen so new users don't see it on day 3
    localStorage.setItem('gj_whats_new_' + WHATS_NEW_VERSION + '_' + currentUser.id, '1');
  }
  // Personalise greeting on first load
  if (userGoal) applyGoalPersonalization();
}

function applyGoalPersonalization() {
  // Personalize the hero greeting and session CTA based on goal
  const goalMessages = {
    stress: { greeting: 'Let’s find some calm', cta: 'Begin stress-relief session →' },
    gratitude: { greeting: 'Let’s count your blessings', cta: 'Begin gratitude session →' },
    clarity: { greeting: 'Let’s clear your mind', cta: 'Begin reflection session →' },
    growth: { greeting: 'Let’s reflect and grow', cta: 'Begin reflection session →' },
  };
  const msg = goalMessages[userGoal];
  if (!msg) return;
  const cta = document.getElementById('cta-btn-text');
  if (cta) cta.textContent = msg.cta;
}

// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// VOICE
// ══════════════════════════════════════════════════
// ── VOICE ─────────────────────────────────────────
let voiceOn = false, activeAudio = null, bVoice = null;

function initBV() {
  if (!window.speechSynthesis) return;
  const pick = () => {
    const vs = window.speechSynthesis.getVoices();
    if (!vs.length) return;
    // Priority list — calming, natural English voices available on iOS/macOS
    const preferred = [
      'Samantha',   // iOS default — warm, natural
      'Ava',        // iOS — very calm and clear
      'Allison',    // macOS — smooth and warm
      'Victoria',   // macOS — soft
      'Karen',      // Australian — gentle
      'Moira',      // Irish — warm
      'Tessa',      // South African — calm
      'Kate',       // British — clear
    ];
    for (const name of preferred) {
      const v = vs.find(x => x.name.includes(name));
      if (v) { bVoice = v; break; }
    }
    // Fallback: any local English voice
    if (!bVoice) {
      bVoice = vs.find(v => v.lang.startsWith('en') && v.localService)
             || vs.find(v => v.lang.startsWith('en'))
             || vs[0];
    }
  };
  pick();
  window.speechSynthesis.onvoiceschanged = pick;
}

function stopAudio() {
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showBars(false);
}

function say(text, done) { if (!voiceOn) { if (done) done(); return; } tts(text, done); }

function tts(text, done) { bTTS(text, done); }

function bTTS(text, done) {
  if (!window.speechSynthesis) { if (done) done(); return; }
  showBars(true);
  // Small delay lets the browser catch up before speaking
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate  = 0.82;   // slightly slower — more calming
    u.pitch = 0.95;   // slightly lower — warmer
    u.volume = 1;
    if (bVoice) u.voice = bVoice;
    u.onend  = () => { showBars(false); if (done) done(); };
    u.onerror = () => { showBars(false); if (done) done(); };
    window.speechSynthesis.speak(u);
  }, 80);
}

function showBars(v) { const el = document.getElementById('speak-anim'); if (el) el.classList.toggle('show', v); }

function toggleVoice() {
  voiceOn = !voiceOn;
  const b = document.getElementById('voiceBtn');
  b.textContent = voiceOn ? '🔊 Voice on' : '🔈 Voice';
  b.classList.toggle('on', voiceOn);
  if (!voiceOn) stopAudio();
  else say('Voice narration is on.');
}

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

// ── ON THIS DAY MEMORIES ──────────────────────────
function renderMemories() {
  const wrap = document.getElementById('memories-wrap');
  if (!wrap) return;

  const es = getEntries();
  if (es.length < 1) { wrap.innerHTML = ''; return; }

  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();
  const todayYear = today.getFullYear();

  // Find entries from same month+day in past years/weeks
  const memories = es.filter(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === todayYear && d.getMonth() === todayMonth && d.getDate() === todayDay) return false; // skip today
    // Match exact month+day from any past year
    if (d.getMonth() === todayMonth && d.getDate() === todayDay) return true;
    return false;
  });

  // If no exact-date matches, look for entries from this week last month or week-of-year
  let displayMemories = memories;
  let memoryLabel = 'On this day';

  if (memories.length === 0) {
    // Find entry from exactly 30 days ago
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30); thirtyDaysAgo.setHours(0,0,0,0);
    const monthAgoStr = thirtyDaysAgo.toDateString();
    const monthMemory = es.find(e => new Date(e.date).toDateString() === monthAgoStr);
    if (monthMemory) {
      displayMemories = [monthMemory];
      memoryLabel = '1 month ago';
    } else {
      // Try 7 days ago
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); sevenDaysAgo.setHours(0,0,0,0);
      const weekAgoStr = sevenDaysAgo.toDateString();
      const weekMemory = es.find(e => new Date(e.date).toDateString() === weekAgoStr);
      if (weekMemory) {
        displayMemories = [weekMemory];
        memoryLabel = '1 week ago';
      }
    }
  }

  if (displayMemories.length === 0) { wrap.innerHTML = ''; return; }

  // Take the first/most relevant memory
  const memory = displayMemories[0];
  const memDate = new Date(memory.date);
  const yearsAgo = todayYear - memDate.getFullYear();

  let dateLabel;
  if (memoryLabel === 'On this day' && yearsAgo > 0) {
    dateLabel = yearsAgo === 1 ? '1 year ago today' : `${yearsAgo} years ago today`;
  } else {
    dateLabel = memoryLabel;
  }

  // Get a meaningful excerpt
  const answers = memory.answers || [];
  const excerpt = answers.find(a => a && a.length > 10) || answers[0] || '';
  const trimmed = excerpt.length > 140 ? excerpt.substring(0, 140) + '…' : excerpt;

  if (!trimmed) { wrap.innerHTML = ''; return; }

  const fullDate = memDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  wrap.innerHTML = `
    <div class="memory-card" onclick="openMemory('${memory.id}')">
      <div class="memory-eyebrow">
        <span class="memory-icon">🕰️</span>
        <span class="memory-label">${dateLabel}</span>
      </div>
      <div class="memory-date">${fullDate}</div>
      <div class="memory-excerpt">"${esc(trimmed)}"</div>
      <div class="memory-cta">Tap to read full entry →</div>
    </div>`;
}

function openMemory(id) {
  const e = getEntries().find(x => x.id === id);
  if (!e) return;
  // Navigate to history and open this entry's detail
  goPage('history');
  setTimeout(() => {
    if (typeof showEntryDetail === 'function') showEntryDetail(id);
  }, 100);
}

let reviveDate = null; // date being revived

function renderStreakRevive() {
  const wrap = document.getElementById('streak-revive-wrap');
  if (!wrap) return;

  const es = getEntries();
  const s = streak();

  // Only show if user has journaled before and missed yesterday
  if (s < 1 || es.length < 1) { wrap.innerHTML = ''; return; }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayStr = yesterday.toDateString();

  const journaledYesterday = es.find(e => new Date(e.date).toDateString() === yesterdayStr);
  const frozenYesterday = getFrozenDates().includes(yesterdayStr);

  if (journaledYesterday || frozenYesterday) { wrap.innerHTML = ''; return; }

  // Check if we already revived yesterday
  const revivedDates = JSON.parse(localStorage.getItem('gj_revived_' + (currentUser?.id || '')) || '[]');
  if (revivedDates.includes(yesterdayStr)) { wrap.innerHTML = ''; return; }

  const yLabel = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  wrap.innerHTML = `
    <div class="revive-card">
      <div class="revive-left">
        <div class="revive-icon">🔥</div>
        <div class="revive-info">
          <div class="revive-title">Revive your streak</div>
          <div class="revive-sub">You missed <strong>${yLabel}</strong>. Journal for that day to keep your streak alive.</div>
        </div>
      </div>
      <button class="revive-btn" onclick="beginReviveSession()">Journal for ${yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} →</button>
    </div>`;
}

function beginReviveSession() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  reviveDate = yesterday.toISOString();
  moodBefore = null; moodAfter = null;
  sessionQs = pickQs(); qIdx = 0;
  qAnswers = Array(sessionQs.length).fill('');
  inputMode = 'voice';
  renderBreathOpts();
  goPage('breath');
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

// Contextual responses to give meaning after picking a mood
const MOOD_BEFORE_RESPONSES = [
  "It takes courage to name that. This is exactly when journaling matters most.",
  "Tough days are real. The fact that you're here means something.",
  "Okay is a perfectly valid place to start from.",
  "Nice — let's build on that energy.",
  "Beautiful starting point. Let's deepen this feeling.",
];

const MOOD_AFTER_RESPONSES = {
  big_lift:    "That's a real shift. You came in one way and you're leaving another.",
  small_lift:  "Even a small lift counts. This is the practice working.",
  no_change:   "Sometimes journaling settles you rather than lifting you. That's also a win.",
  small_drop:  "It's okay if reflection brings up real feelings. You did the harder thing by going deep.",
  big_drop:    "You faced something honest in there. Be gentle with yourself tonight.",
};

function getMoodBeforeContext(idx) {
  return MOOD_BEFORE_RESPONSES[idx] || '';
}

function getMoodAfterContext(after) {
  if (moodBefore == null || after == null) return '';
  const diff = after - moodBefore;
  if (diff >= 2) return MOOD_AFTER_RESPONSES.big_lift;
  if (diff === 1) return MOOD_AFTER_RESPONSES.small_lift;
  if (diff === 0) return MOOD_AFTER_RESPONSES.no_change;
  if (diff === -1) return MOOD_AFTER_RESPONSES.small_drop;
  return MOOD_AFTER_RESPONSES.big_drop;
}

function setMoodBeforeIntro() {
  const eyebrow = document.getElementById('mood-before-eyebrow');
  const title = document.getElementById('mood-before-title');
  const sub = document.getElementById('mood-before-sub');
  if (!eyebrow) return;

  const s = streak();
  const h = new Date().getHours();
  const name = currentUser?.user_metadata?.full_name?.split(' ')[0] || '';

  // Eyebrow shows context: streak status or time
  if (s >= 7) eyebrow.textContent = `Day ${s + 1} · check-in`;
  else if (s >= 1) eyebrow.textContent = `Day ${s + 1} · check-in`;
  else eyebrow.textContent = h < 12 ? 'Morning check-in' : h < 17 ? 'Afternoon check-in' : h < 21 ? 'Evening check-in' : 'Late check-in';

  // Personal title
  if (name) title.textContent = `How are you, ${name}?`;
  else title.textContent = 'How are you feeling?';

  // Time-of-day sub copy
  if (h < 12) sub.textContent = 'Whatever you bring this morning is welcome. Start where you are.';
  else if (h < 17) sub.textContent = 'Pause for a moment — how is the day actually treating you?';
  else if (h < 21) sub.textContent = 'Evening is a good time to be honest. What\'s the truth right now?';
  else sub.textContent = 'Quiet hours are for honesty. Whatever you feel is fine to feel.';
}

function renderMoodPicker(containerId, labelId) {
  const c = document.getElementById(containerId);
  c.innerHTML = MOODS.map((m, i) => `<button class="mood-btn" onclick="pickMood('${containerId}','${labelId}',${i})">${m.e}</button>`).join('');
  // Set personalized intro for the before screen
  if (containerId === 'mood-emojis-before') {
    setMoodBeforeIntro();
    const ctx = document.getElementById('mood-before-context'); if (ctx) ctx.textContent = '';
  } else {
    const ctx = document.getElementById('mood-after-context'); if (ctx) ctx.textContent = '';
  }
}

function pickMood(containerId, labelId, idx) {
  document.querySelectorAll(`#${containerId} .mood-btn`).forEach((b, i) => b.classList.toggle('picked', i === idx));
  document.getElementById(labelId).textContent = MOODS[idx].label;
  if (containerId === 'mood-emojis-before') {
    moodBefore = idx;
    document.getElementById('mood-before-next').disabled = false;
    const ctx = document.getElementById('mood-before-context');
    if (ctx) ctx.textContent = getMoodBeforeContext(idx);
  } else {
    moodAfter = idx;
    document.getElementById('mood-after-next').disabled = false;
    const ctx = document.getElementById('mood-after-context');
    if (ctx) ctx.textContent = getMoodAfterContext(idx);
  }
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

// ── MILESTONE CELEBRATIONS ─────────────────────────
const MILESTONES = [
  { count: 1,   icon: '🌱', title: 'First entry',        message: 'The hardest one is always the first. You just did something your future self will thank you for.' },
  { count: 7,   icon: '🔥', title: '7 entries',          message: 'One week of showing up for yourself. Most people never make it this far. You are in rare company.' },
  { count: 14,  icon: '⚡', title: '14 entries',         message: 'Two weeks in. The habit is forming. Your brain is literally rewiring around this practice.' },
  { count: 30,  icon: '🏆', title: '30 entries',         message: 'Thirty reflections. Research shows it takes 21 days to form a habit — you have just surpassed it. This is yours now.' },
  { count: 50,  icon: '💎', title: '50 entries',         message: 'Fifty moments of honest reflection. You have built something most people only talk about building.' },
  { count: 100, icon: '🌟', title: '100 entries',        message: 'One hundred entries. You have created a record of your inner life that almost no one in history has ever had. This is extraordinary.' },
  { count: 200, icon: '🦋', title: '200 entries',        message: 'Two hundred. You are not building a habit anymore — you have built a practice. This is who you are.' },
  { count: 365, icon: '👑', title: 'A year of entries',  message: 'A full year of reflection. Whatever happened this year, you showed up for it with honesty and intention. That is rare. That is powerful.' },
];

// Streak milestone celebrations — separate from total entry milestones
const STREAK_MILESTONES = [
  { days: 3,   icon: '🌱', title: '3-day streak!',     subtitle: 'The habit is taking root', message: 'Three days in a row. The first three are the hardest — you just got past them.', gradient: 'linear-gradient(135deg,#7BBDA4,#2D7A5F)' },
  { days: 7,   icon: '🔥', title: '7-day streak!',     subtitle: 'You showed up all week',   message: 'A full week of consistency. This is the moment most people quit — and you didn\'t. The compounding starts now.', gradient: 'linear-gradient(135deg,#E8B05A,#C97B3D)' },
  { days: 14,  icon: '⚡', title: '14-day streak!',    subtitle: 'Two weeks of showing up', message: 'Two solid weeks. You\'re past the "trying it out" phase — this is becoming part of who you are.', gradient: 'linear-gradient(135deg,#5B4A8A,#3a2f5e)' },
  { days: 30,  icon: '🏆', title: '30-day streak!',    subtitle: 'A real practice',          message: 'A full month. Habit researchers say you\'ve crossed the line where this stops being effort and starts being identity. You ARE someone who journals.', gradient: 'linear-gradient(135deg,#D4B95C,#8a7240)' },
  { days: 60,  icon: '💎', title: '60-day streak!',    subtitle: 'Two months strong',        message: 'Sixty consecutive days. You\'re in the top 1% of consistency. The science of gratitude has had time to work — your baseline mood is genuinely shifting.', gradient: 'linear-gradient(135deg,#1E6A8A,#114866)' },
  { days: 100, icon: '🌟', title: '100-day streak!',   subtitle: 'Triple digits',            message: 'One hundred days. Most adults never sustain a personal practice this long. You\'ve built proof that you can keep promises to yourself.', gradient: 'linear-gradient(135deg,#8A3030,#5e1f1f)' },
  { days: 200, icon: '🦋', title: '200-day streak!',   subtitle: 'A practice you\'ve made',  message: 'Two hundred days in a row. This is no longer something you do — it\'s who you are. The version of you from 200 days ago wouldn\'t recognize this discipline.', gradient: 'linear-gradient(135deg,#9A6520,#6e4615)' },
  { days: 365, icon: '👑', title: '365-day streak!',   subtitle: 'A full year, every day',   message: 'One year. Every. Single. Day. You\'ve done what almost no one ever does. This streak isn\'t just a number — it\'s a record of your character.', gradient: 'linear-gradient(135deg,#2D7A5F,#7BBDA4)' },
];

function checkMilestone(total) {
  const milestone = MILESTONES.find(m => m.count === total);
  if (!milestone) return;
  const seenKey = 'gj_milestone_seen_' + total;
  if (localStorage.getItem(seenKey)) return;
  localStorage.setItem(seenKey, '1');
  showMilestone(milestone);
}

function checkStreakMilestone(streakDays) {
  const milestone = STREAK_MILESTONES.find(m => m.days === streakDays);
  if (!milestone) return;
  const seenKey = 'gj_streak_milestone_seen_' + streakDays;
  if (localStorage.getItem(seenKey)) return;
  localStorage.setItem(seenKey, '1');
  showStreakMilestone(milestone);
}

function showStreakMilestone(m) {
  const overlay = document.createElement('div');
  overlay.className = 'streak-milestone-overlay';
  overlay.innerHTML = `
    <div class="streak-milestone-card" style="background:${m.gradient};">
      <div class="streak-milestone-icon">${m.icon}</div>
      <div class="streak-milestone-eyebrow">${m.subtitle}</div>
      <div class="streak-milestone-title">${m.title}</div>
      <div class="streak-milestone-message">${m.message}</div>
      <div class="streak-milestone-actions">
        <button class="streak-milestone-share" onclick="shareStreakMilestone(${m.days},'${m.icon}','${m.title.replace(/'/g, "\\'")}')">↗ Share my milestone</button>
        <button class="streak-milestone-continue" onclick="this.closest('.streak-milestone-overlay').remove()">Keep going →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  launchConfetti();
  if (voiceOn) setTimeout(() => say(m.message), 400);
}

function shareStreakMilestone(days, icon, title) {
  // Build a beautiful shareable card using existing canvas system
  const text = `${icon} ${days}-day Gratitude streak — and counting.`;
  if (typeof openQuoteCard === 'function') {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    openQuoteCard(text, dateStr);
  } else if (navigator.share) {
    navigator.share({ title: 'My Gratitude Streak', text }).catch(() => {});
  }
}

function showMilestone(m) {
  // Create a full-screen milestone overlay on top of the summary page
  const overlay = document.createElement('div');
  overlay.className = 'milestone-overlay';
  overlay.innerHTML = '<div class="milestone-inner">'
    + '<div class="milestone-icon">' + m.icon + '</div>'
    + '<div class="milestone-title">' + m.title + '</div>'
    + '<div class="milestone-message">' + m.message + '</div>'
    + '<button class="ob-btn" onclick="this.closest(\'.milestone-overlay\').remove()">Keep going →</button>'
    + '</div>';
  document.body.appendChild(overlay);
  launchConfetti();
  if (voiceOn) setTimeout(() => say(m.message), 400);
}

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

  // Find the best highlight quote from this week
  let highlight = null, highlightDate = null;
  we.forEach(e => { (e.answers || []).forEach(a => { if (a && a.length > 30 && (!highlight || a.length > highlight.length)) { highlight = a; highlightDate = e.date; } }); });

  // Extract top meaningful words from this week's entries (word cloud insight)
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','my','i','me','was','is','are','were','have','had','has','that','this','it','be','been','not','so','if','as','do','did','what','how','just','like','very','from','about','when','who','which','can','will','would','could','should','than','then','there','their','they','we','our','your','you','he','she','his','her','him','its','all','one','out','up','by','more','also','am','into','get','got','no','any']);
  const wordCount = {};
  we.forEach(e => {
    (e.answers || []).forEach(a => {
      if (!a) return;
      a.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
        if (w.length > 3 && !stopWords.has(w)) wordCount[w] = (wordCount[w] || 0) + 1;
      });
    });
  });
  const topWords = Object.entries(wordCount).sort((a,b) => b[1]-a[1]).slice(0, 5).map(([w]) => w);

  const msgs = [[7,'You showed up every single day this week. That kind of commitment is rare and powerful.'],[5,"Five days this week. You're building something real — one entry at a time."],[3,"Three sessions this week. Consistency is a practice, not a perfection. You're doing it."],[2,'Two entries this week. Every reflection counts.'],[0,'You journaled this week. That alone is worth celebrating.']];
  const msg = msgs.find(([d]) => days >= d)[1];

  const moodHtml = avgB != null && avgA != null ? '<div class="weekly-mood-row"><div class="weekly-mood-block"><span class="weekly-mood-emoji">' + MOODS[avgB].e + '</span><div class="weekly-mood-label">avg before</div></div><div class="weekly-mood-arrow">→</div><div class="weekly-mood-block"><span class="weekly-mood-emoji">' + MOODS[avgA].e + '</span><div class="weekly-mood-label">avg after</div></div>' + (lift != null && lift > 0 ? '<span class="weekly-mood-lift">↑ ' + lift + ' avg lift</span>' : '') + '</div>' : '';

  const quoteHtml = highlight ? '<div class="weekly-quote"><div class="weekly-quote-text">\u201C' + esc(highlight.length > 120 ? highlight.slice(0, 120).trim() + '\u2026' : highlight) + '\u201D</div><div class="weekly-quote-attr">\u2014 Your entry, ' + new Date(highlightDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</div></div>' : '';

  const wordsHtml = topWords.length >= 3 ? '<div class="weekly-words"><div class="weekly-words-label">Words on your mind this week</div><div class="weekly-words-chips">' + topWords.map(w => '<span class="weekly-word-chip">' + w + '</span>').join('') + '</div></div>' : '';

  const now2 = new Date(), wa2 = new Date(); wa2.setDate(wa2.getDate() - 6);
  const range = wa2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' \u2013 ' + now2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const goalInsight = getGoalInsight(we);

  el.innerHTML = '<div class="weekly-card"><div class="weekly-eyebrow">Weekly reflection \xb7 ' + range + '</div><div class="weekly-stats"><div class="weekly-stat"><span class="weekly-stat-val">' + days + '</span><span class="weekly-stat-key">days journaled</span></div><div class="weekly-stat"><span class="weekly-stat-val">' + we.length + '</span><span class="weekly-stat-key">total entries</span></div><div class="weekly-stat"><span class="weekly-stat-val">' + streak() + '</span><span class="weekly-stat-key">day streak</span></div></div>' + moodHtml + '<div class="weekly-message">' + msg + '</div>' + (goalInsight ? '<div class="weekly-goal-insight">' + goalInsight + '</div>' : '') + wordsHtml + quoteHtml + '<button class="weekly-dismiss" onclick="dismissWeekly()">Dismiss for this week</button></div>';
}

function getGoalInsight(entries) {
  const goal = localStorage.getItem('gj_goal');
  if (!goal || !entries.length) return null;
  const insights = {
    stress: 'Your breathing sessions this week are actively rewiring your stress response. Keep going.',
    gratitude: 'Each specific thing you wrote down is training your brain to scan for the good. It compounds.',
    clarity: 'Writing things out forces your brain to organise what feels chaotic. That clarity is real.',
    growth: 'Every entry is a data point about who you are and who you\'re becoming. You\'re paying attention.'
  };
  return insights[goal] || null;
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
  if (id === 'history') { histSearchQuery = ''; histFilter = 'all'; histTagFilter = null; renderTagFilterRow(); renderHistory(); initPullToRefresh(); }
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

function calcMoodInsights() {
  const es = getEntries().filter(e => e.mood_after != null);
  if (es.length < 5) return null;

  // Best/worst day of week for after-mood
  const dowMoods = [[],[],[],[],[],[],[]];
  es.forEach(e => {
    const day = new Date(e.date).getDay();
    dowMoods[day].push(e.mood_after);
  });
  const dowAvg = dowMoods.map((arr,i) => ({
    day: i,
    name: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i],
    avg: arr.length ? arr.reduce((s,m) => s+m, 0) / arr.length : null,
    count: arr.length,
  })).filter(d => d.count >= 1);

  let bestDay = null, worstDay = null;
  if (dowAvg.length >= 3) {
    const sorted = [...dowAvg].sort((a,b) => b.avg - a.avg);
    bestDay = sorted[0];
    worstDay = sorted[sorted.length - 1];
  }

  // Trend over time — split entries in half, compare averages
  let trend = null;
  if (es.length >= 10) {
    const sorted = [...es].sort((a,b) => new Date(a.date) - new Date(b.date));
    const mid = Math.floor(sorted.length / 2);
    const earlier = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    const earlierAvg = earlier.reduce((s,e) => s+e.mood_after, 0) / earlier.length;
    const recentAvg = recent.reduce((s,e) => s+e.mood_after, 0) / recent.length;
    const diff = +(recentAvg - earlierAvg).toFixed(2);
    if (Math.abs(diff) >= 0.3) {
      trend = diff > 0 ? 'rising' : 'falling';
    } else {
      trend = 'stable';
    }
  }

  // Average lift consistency
  const withBoth = es.filter(e => e.mood_before != null);
  const liftPositiveCount = withBoth.filter(e => e.mood_after > e.mood_before).length;
  const liftRate = withBoth.length ? Math.round((liftPositiveCount / withBoth.length) * 100) : null;

  // Time of day mood
  const timeMoods = { morning: [], afternoon: [], evening: [], night: [] };
  es.forEach(e => {
    const h = new Date(e.date).getHours();
    if (h < 12) timeMoods.morning.push(e.mood_after);
    else if (h < 17) timeMoods.afternoon.push(e.mood_after);
    else if (h < 21) timeMoods.evening.push(e.mood_after);
    else timeMoods.night.push(e.mood_after);
  });
  const timeAvgs = Object.entries(timeMoods)
    .filter(([,arr]) => arr.length >= 2)
    .map(([t, arr]) => ({ time: t, avg: arr.reduce((s,m)=>s+m,0)/arr.length }))
    .sort((a,b) => b.avg - a.avg);
  const bestTime = timeAvgs[0] || null;

  return { bestDay, worstDay, trend, liftRate, bestTime };
}

function renderMoodInsights() {
  const insights = calcMoodInsights();
  if (!insights) return '';

  const items = [];

  if (insights.bestDay && insights.worstDay && insights.bestDay.day !== insights.worstDay.day) {
    items.push({
      icon: '📅',
      text: `<strong>${insights.bestDay.name}s</strong> tend to be your best — average mood ${MOODS[Math.round(insights.bestDay.avg)].e}`
    });
  }

  if (insights.trend === 'rising') {
    items.push({
      icon: '📈',
      text: `Your overall mood is <strong>trending up</strong> compared to when you started. Real progress.`
    });
  } else if (insights.trend === 'falling') {
    items.push({
      icon: '🌊',
      text: `Your mood has dipped recently. You're not failing — you're noticing. That's the work.`
    });
  } else if (insights.trend === 'stable') {
    items.push({
      icon: '🌿',
      text: `Your mood is staying steady — a sign your practice is regulating you.`
    });
  }

  if (insights.liftRate != null && insights.liftRate >= 50) {
    items.push({
      icon: '✨',
      text: `<strong>${insights.liftRate}% of sessions</strong> leave you feeling better than when you started.`
    });
  }

  if (insights.bestTime) {
    const timeNames = { morning: 'mornings', afternoon: 'afternoons', evening: 'evenings', night: 'late nights' };
    items.push({
      icon: '🕐',
      text: `You feel best after journaling in the <strong>${timeNames[insights.bestTime.time]}</strong>.`
    });
  }

  if (items.length === 0) return '';

  return `
    <div class="mood-insights">
      <div class="mood-insights-title">Patterns we noticed</div>
      ${items.map(item => `
        <div class="mood-insight-item">
          <span class="mood-insight-icon">${item.icon}</span>
          <span class="mood-insight-text">${item.text}</span>
        </div>
      `).join('')}
    </div>`;
}

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

  const insightsHtml = renderMoodInsights();

  wrap.innerHTML = `
    <div class="mood-chart-card">
      <div class="mood-chart-title">Mood over time</div>
      <div class="mood-chart-sub">How you felt before and after each session</div>
      ${avgTiles}
      ${insightsHtml}
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
const HOME_AFFIRMATIONS = [
  "You showed up. That's the whole point.",
  "Small moments. Real change.",
  "One reflection at a time.",
  "Your future self is grateful you're here.",
  "Today is a fresh page.",
  "Notice the good. It's there.",
  "Your practice is shaping you.",
  "Slow down. Breathe. Begin.",
  "What you focus on grows.",
  "This moment is enough.",
  "Tiny actions. Lasting impact.",
  "Be where your feet are.",
  "Kindness toward yourself first.",
  "You're building something real.",
  "Trust the process.",
];

function getSmartGreeting(name, h, journaledToday, s) {
  // Context-aware greetings based on time, streak, and today's status
  const namePart = name ? `, ${name}` : '';

  if (journaledToday) {
    if (h < 12) return `Beautiful start${namePart}`;
    if (h < 17) return `Well done${namePart}`;
    return `Rest easy${namePart}`;
  }

  if (s >= 30 && h < 12) return `Day ${s + 1} awaits${namePart}`;
  if (s >= 7 && h >= 18) return `One last reflection${namePart}?`;
  if (h < 5) return `Late night${namePart}`;
  if (h < 12) return `Good morning${namePart}`;
  if (h < 17) return `Good afternoon${namePart}`;
  if (h < 21) return `Good evening${namePart}`;
  return `Quiet hours${namePart}`;
}

function getStreakProgressMessage(s, journaledToday) {
  if (journaledToday && s >= 1) {
    const next = [3, 7, 14, 30, 60, 100, 365].find(n => n > s);
    if (next) {
      const left = next - s;
      return `${left} ${left === 1 ? 'day' : 'days'} until ${next}-day milestone 🌱`;
    }
    return null;
  }
  if (s >= 1 && !journaledToday) {
    return s === 1 ? 'Journal today to build your streak' : `Journal today to extend your ${s}-day streak`;
  }
  return null;
}

function renderHome() {
  const h = new Date().getHours();
  const name = currentUser?.user_metadata?.full_name?.split(' ')[0] || '';
  const s = streak();

  // Check if user journaled today
  const todayStr = new Date().toDateString();
  const journaledToday = getEntries().some(e => new Date(e.date).toDateString() === todayStr);

  document.getElementById('hero-greeting').textContent = getSmartGreeting(name, h, journaledToday, s);
  document.getElementById('hero-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Daily affirmation in eyebrow (changes daily)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const affirmation = HOME_AFFIRMATIONS[dayOfYear % HOME_AFFIRMATIONS.length];
  document.getElementById('hero-eyebrow').textContent = affirmation;

  document.getElementById('nav-streak').textContent = s;
  document.getElementById('st-streak').textContent = s;
  document.getElementById('st-total').textContent = getEntries().length;
  document.getElementById('st-week').textContent = weekCount();

  // Update CTA based on today's status
  const ctaBtn = document.querySelector('.cta-btn');
  if (ctaBtn) {
    if (journaledToday) {
      ctaBtn.innerHTML = '✓ Today\'s entry complete <span class="cta-arrow">→</span>';
      ctaBtn.classList.add('cta-done');
    } else {
      ctaBtn.innerHTML = 'Begin today\'s journal <span class="cta-arrow">→</span>';
      ctaBtn.classList.remove('cta-done');
    }
  }

  // Streak progress message under CTA
  let streakProgressEl = document.getElementById('streak-progress-msg');
  if (!streakProgressEl) {
    streakProgressEl = document.createElement('div');
    streakProgressEl.id = 'streak-progress-msg';
    streakProgressEl.className = 'streak-progress-msg';
    ctaBtn?.parentNode?.insertBefore(streakProgressEl, ctaBtn.nextSibling);
  }
  const progressMsg = getStreakProgressMessage(s, journaledToday);
  streakProgressEl.textContent = progressMsg || '';
  streakProgressEl.style.display = progressMsg ? 'block' : 'none';

  renderWeeklyReflection();
  renderReminderCard();
  renderHeatmap();
  renderBadges(s);
  renderFreezeCard();
  renderStreakRevive();
  renderMemories();
  renderChallenge();
  renderAffirmation();
  renderResumeDraft();
  renderQuickMood();
  renderMoodLogChart();
  const es = getEntries().slice(0, 3), el = document.getElementById('recent-entries');
  if (!es.length) {
    const goal = localStorage.getItem('gj_goal') || 'gratitude';
    const goalCopy = {
      stress: { title: 'Ready to set down today?', sub: 'Your first session is 5 minutes. By the end you\'ll feel something shift.' },
      gratitude: { title: 'Your gratitude practice begins now', sub: 'Just 5 minutes a day. The science says this rewires your brain — and you\'ll start feeling it within a week.' },
      clarity: { title: 'Time to get clear', sub: 'Five minutes of honest reflection beats hours of rumination. Your mind already knows what to write.' },
      growth: { title: 'Day one of becoming', sub: 'Every entry is a data point about who you\'re becoming. Start the practice that future-you will thank you for.' },
    };
    const c = goalCopy[goal];

    el.innerHTML = `<div class="empty-state-rich">
      <div class="empty-rich-icon">🌱</div>
      <div class="empty-rich-title">${c.title}</div>
      <div class="empty-rich-sub">${c.sub}</div>
      <div class="empty-rich-features">
        <div class="empty-rich-feat"><span>🫁</span><span>1 minute breathing</span></div>
        <div class="empty-rich-feat"><span>📝</span><span>5 thoughtful questions</span></div>
        <div class="empty-rich-feat"><span>📊</span><span>Mood tracking</span></div>
      </div>
      <button class="empty-rich-cta" onclick="beginSession()">Begin your first session →</button>
      <div class="empty-rich-trust">5 minutes · Speak or type · Private to you</div>
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
let histTagFilter = null; // null = all, otherwise tag color key

function setHistTagFilter(tag) {
  // Toggle off if same tag clicked again
  histTagFilter = (histTagFilter === tag) ? null : tag;
  renderTagFilterRow();
  renderHistory();
}

function renderTagFilterRow() {
  const row = document.getElementById('tag-filter-row');
  if (!row) return;

  // Get all entries and count tags
  const entries = getEntries();
  const tagCounts = {};
  entries.forEach(e => {
    const tag = getEntryTag(e.id);
    if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  });

  // Hide row entirely if no tags used yet
  if (Object.keys(tagCounts).length === 0) {
    row.innerHTML = '';
    return;
  }

  // Order matches ENTRY_TAGS for consistency
  const orderedTags = Object.keys(ENTRY_TAGS).filter(t => tagCounts[t] > 0);

  row.innerHTML = `
    <div class="tag-filter-label">Filter by tag:</div>
    <div class="tag-filter-chips">
      ${histTagFilter ? `<button class="tag-filter-chip tag-filter-clear" onclick="setHistTagFilter('${histTagFilter}')">✕ Clear</button>` : ''}
      ${orderedTags.map(t => {
        const tag = ENTRY_TAGS[t];
        const isActive = histTagFilter === t;
        return `<button class="tag-filter-chip ${isActive ? 'active' : ''}" onclick="setHistTagFilter('${t}')" style="${isActive ? `background:${tag.color};color:#fff;border-color:${tag.color};` : ''}">
          <span class="tag-filter-dot" style="background:${tag.color};"></span>
          ${tag.label}
          <span class="tag-filter-count">${tagCounts[t]}</span>
        </button>`;
      }).join('')}
    </div>`;
}

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

// ── PULL TO REFRESH ───────────────────────────────
let ptrEnabled = false;
let ptrStartY = 0;
let ptrCurrentY = 0;
let ptrPulling = false;
let ptrRefreshing = false;
const PTR_TRIGGER = 70; // px of pull required to trigger refresh
const PTR_MAX = 120;    // max visible pull distance

function initPullToRefresh() {
  if (ptrEnabled) return; // listeners persist across page nav
  ptrEnabled = true;

  // Inject indicator if missing
  if (!document.getElementById('ptr-indicator')) {
    const ind = document.createElement('div');
    ind.id = 'ptr-indicator';
    ind.className = 'ptr-indicator';
    ind.innerHTML = `
      <div class="ptr-spinner"></div>
      <div class="ptr-label" id="ptr-label">Pull to refresh</div>
    `;
    document.body.appendChild(ind);
  }

  // Use document-level listeners so they work regardless of which page is active
  document.addEventListener('touchstart', ptrOnTouchStart, { passive: true });
  document.addEventListener('touchmove', ptrOnTouchMove, { passive: false });
  document.addEventListener('touchend', ptrOnTouchEnd, { passive: true });
}

function ptrIsActiveOnHistory() {
  const histPage = document.getElementById('page-history');
  return histPage && histPage.classList.contains('active');
}

function ptrOnTouchStart(e) {
  if (!ptrIsActiveOnHistory() || ptrRefreshing) return;
  // Only trigger when scrolled to top
  if (window.scrollY > 0) return;
  ptrStartY = e.touches[0].clientY;
  ptrPulling = true;
}

function ptrOnTouchMove(e) {
  if (!ptrPulling || ptrRefreshing) return;
  if (window.scrollY > 0) { ptrPulling = false; return; }

  ptrCurrentY = e.touches[0].clientY;
  const delta = ptrCurrentY - ptrStartY;

  if (delta <= 0) return; // user is scrolling up, not down

  // Prevent native overscroll bounce while we're animating
  if (e.cancelable) e.preventDefault();

  const pullDistance = Math.min(delta * 0.5, PTR_MAX); // dampen the pull
  const ind = document.getElementById('ptr-indicator');
  const label = document.getElementById('ptr-label');
  if (ind) {
    ind.style.transform = `translateY(${pullDistance}px)`;
    ind.style.opacity = Math.min(pullDistance / 50, 1);
    ind.classList.toggle('ready', pullDistance >= PTR_TRIGGER);
  }
  if (label) label.textContent = pullDistance >= PTR_TRIGGER ? 'Release to refresh' : 'Pull to refresh';
}

async function ptrOnTouchEnd() {
  if (!ptrPulling || ptrRefreshing) { ptrPulling = false; return; }
  ptrPulling = false;

  const delta = ptrCurrentY - ptrStartY;
  const pullDistance = Math.min(delta * 0.5, PTR_MAX);
  const ind = document.getElementById('ptr-indicator');
  const label = document.getElementById('ptr-label');

  if (pullDistance >= PTR_TRIGGER) {
    // Trigger refresh
    ptrRefreshing = true;
    if (ind) {
      ind.style.transform = `translateY(60px)`;
      ind.classList.add('refreshing');
    }
    if (label) label.textContent = 'Refreshing…';

    try {
      await loadEntries();
      // Brief delay so the spinner is visible (feels intentional, not glitchy)
      await new Promise(r => setTimeout(r, 400));
      renderHistory();
      renderTagFilterRow();
      if (label) label.textContent = '✓ Updated';
    } catch(e) {
      if (label) label.textContent = 'Could not refresh';
    }

    setTimeout(() => {
      if (ind) {
        ind.style.transform = 'translateY(-60px)';
        ind.style.opacity = '0';
        ind.classList.remove('refreshing', 'ready');
      }
      ptrRefreshing = false;
    }, 600);
  } else {
    // Snap back
    if (ind) {
      ind.style.transform = 'translateY(-60px)';
      ind.style.opacity = '0';
      ind.classList.remove('ready');
    }
  }

  ptrStartY = 0;
  ptrCurrentY = 0;
}


let histView = 'list'; // 'list' or 'calendar'
let calMonth = new Date(); // currently displayed month

function setHistView(view) {
  histView = view;
  document.getElementById('vt-list')?.classList.toggle('active', view === 'list');
  document.getElementById('vt-calendar')?.classList.toggle('active', view === 'calendar');
  document.getElementById('hist-list').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('hist-calendar').style.display = view === 'calendar' ? 'block' : 'none';
  if (view === 'calendar') {
    calMonth = new Date(); // reset to current month
    renderCalendar();
  } else {
    renderHistory();
  }
}

function calNavMonth(dir) {
  calMonth.setMonth(calMonth.getMonth() + dir);
  renderCalendar();
}

function renderCalendar() {
  const wrap = document.getElementById('hist-calendar');
  if (!wrap) return;

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const today = new Date();
  today.setHours(0,0,0,0);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay(); // 0 = Sunday

  // Group entries by date string for fast lookup
  const es = getEntries();
  const entriesByDate = {};
  es.forEach(e => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!entriesByDate[key]) entriesByDate[key] = [];
    entriesByDate[key].push(e);
  });

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Stats for this month
  const monthEntries = es.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const journaledDays = new Set(monthEntries.map(e => new Date(e.date).getDate())).size;
  const monthCompletionPct = Math.round((journaledDays / daysInMonth) * 100);

  // Build calendar grid
  let cellsHtml = '';
  const dayLabels = ['S','M','T','W','T','F','S'];
  const weekdayHeader = dayLabels.map(d => `<div class="cal-weekday">${d}</div>`).join('');

  // Empty cells before first day
  for (let i = 0; i < startWeekday; i++) {
    cellsHtml += '<div class="cal-cell cal-cell-empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    cellDate.setHours(0,0,0,0);
    const key = `${year}-${month}-${day}`;
    const dayEntries = entriesByDate[key] || [];
    const isToday = cellDate.getTime() === today.getTime();
    const isFuture = cellDate > today;
    const hasEntry = dayEntries.length > 0;

    // Get tag colors for entries on this day
    const tagColors = dayEntries.map(e => getEntryTag(e.id)).filter(Boolean);
    const uniqueTagColors = [...new Set(tagColors)];

    let dotsHtml = '';
    if (uniqueTagColors.length > 0) {
      dotsHtml = '<div class="cal-tag-dots">' + uniqueTagColors.slice(0,3).map(t =>
        `<span class="cal-tag-dot" style="background:${ENTRY_TAGS[t].color};"></span>`
      ).join('') + '</div>';
    }

    const cellClass = [
      'cal-cell',
      hasEntry ? 'has-entry' : '',
      isToday ? 'is-today' : '',
      isFuture ? 'is-future' : '',
    ].filter(Boolean).join(' ');

    const onclick = hasEntry ? `onclick="jumpToCalDate(${year},${month},${day})"` : '';

    cellsHtml += `
      <div class="${cellClass}" ${onclick}>
        <div class="cal-day-num">${day}</div>
        ${hasEntry ? `<div class="cal-entry-count">${dayEntries.length > 1 ? dayEntries.length : '✓'}</div>` : ''}
        ${dotsHtml}
      </div>`;
  }

  wrap.innerHTML = `
    <div class="cal-stats-card">
      <div class="cal-stats-item">
        <div class="cal-stats-val">${journaledDays}</div>
        <div class="cal-stats-key">Days journaled</div>
      </div>
      <div class="cal-stats-item">
        <div class="cal-stats-val">${monthCompletionPct}%</div>
        <div class="cal-stats-key">Of the month</div>
      </div>
      <div class="cal-stats-item">
        <div class="cal-stats-val">${monthEntries.length}</div>
        <div class="cal-stats-key">Total entries</div>
      </div>
    </div>
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="calNavMonth(-1)">‹</button>
      <div class="cal-nav-title">${monthName}</div>
      <button class="cal-nav-btn" onclick="calNavMonth(1)">›</button>
    </div>
    <div class="cal-grid-wrap">
      <div class="cal-weekdays">${weekdayHeader}</div>
      <div class="cal-grid">${cellsHtml}</div>
    </div>
  `;
}

function jumpToCalDate(year, month, day) {
  // Switch to list view and scroll to entries on that date
  setHistView('list');
  setTimeout(() => {
    const target = new Date(year, month, day).toDateString();
    const allEntries = getEntries();
    const matching = allEntries.find(e => new Date(e.date).toDateString() === target);
    if (matching) {
      // Search by date to filter to that day's entries
      const dateLabel = new Date(year, month, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const searchInput = document.getElementById('hist-search');
      if (searchInput) {
        searchInput.value = dateLabel;
        onHistSearch(dateLabel);
      }
    }
  }, 100);
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

  // Tag filter
  if (histTagFilter) {
    es = es.filter(e => getEntryTag(e.id) === histTagFilter);
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

// ── PERSONAL INSIGHTS ─────────────────────────────
function calculateInsights() {
  const es = getEntries();
  if (es.length === 0) return null;

  // Total stats
  let totalWords = 0;
  es.forEach(e => {
    (e.answers || []).forEach(a => {
      if (a) totalWords += a.trim().split(/\s+/).filter(Boolean).length;
    });
  });
  const totalMinutes = Math.max(es.length * 3, Math.round(totalWords / 80));

  // Best ever streak
  const sorted = [...es].sort((a,b) => new Date(a.date) - new Date(b.date));
  let bestStreak = 0, currentRun = 1, prev = null;
  for (const e of sorted) {
    const day = new Date(e.date); day.setHours(0,0,0,0);
    if (prev) {
      const diff = (day - prev) / (24*60*60*1000);
      if (diff === 0) continue; // same day
      if (diff === 1) currentRun++;
      else { bestStreak = Math.max(bestStreak, currentRun); currentRun = 1; }
    }
    prev = day;
  }
  bestStreak = Math.max(bestStreak, currentRun);

  // Mood trends — average lift over time
  const withBoth = es.filter(e => e.mood_before != null && e.mood_after != null);
  const avgLift = withBoth.length
    ? +(withBoth.reduce((s,e) => s + (e.mood_after - e.mood_before), 0) / withBoth.length).toFixed(1)
    : null;
  const avgMoodAfter = es.filter(e => e.mood_after != null).length
    ? +(es.filter(e => e.mood_after != null).reduce((s,e) => s + e.mood_after, 0) / es.filter(e => e.mood_after != null).length).toFixed(1)
    : null;

  // Most active day of week
  const dayOfWeekCounts = [0,0,0,0,0,0,0];
  const hourCounts = new Array(24).fill(0);
  es.forEach(e => {
    const d = new Date(e.date);
    dayOfWeekCounts[d.getDay()]++;
    hourCounts[d.getHours()]++;
  });
  const dayLabels = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const bestDayIdx = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
  const bestDay = dayLabels[bestDayIdx];

  // Most active time of day
  const bestHour = hourCounts.indexOf(Math.max(...hourCounts));
  let timeOfDay;
  if (bestHour < 5) timeOfDay = 'Late night';
  else if (bestHour < 12) timeOfDay = 'Morning';
  else if (bestHour < 17) timeOfDay = 'Afternoon';
  else if (bestHour < 21) timeOfDay = 'Evening';
  else timeOfDay = 'Night';

  // First entry date
  const firstEntry = sorted[0];
  const daysSinceFirst = firstEntry
    ? Math.floor((Date.now() - new Date(firstEntry.date)) / (24*60*60*1000))
    : 0;

  // Tag breakdown (using existing color tags)
  const tagCounts = {};
  es.forEach(e => {
    const tag = getEntryTag(e.id);
    if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  });
  const tagBreakdown = Object.entries(tagCounts).sort((a,b) => b[1] - a[1]);

  return {
    totalEntries: es.length,
    totalWords,
    totalMinutes,
    bestStreak,
    currentStreak: streak(),
    avgLift,
    avgMoodAfter,
    bestDay,
    timeOfDay,
    bestHour,
    daysSinceFirst,
    firstEntry,
    tagBreakdown,
    dayOfWeekCounts,
    topWords: calculateTopWords(es, 25),
  };
}

// Returns 7×4 grid [day][timeSlot] = { avg, count } or null if no data
// Days: 0=Sun, 6=Sat.  Slots: 0=Morning (5-12), 1=Afternoon (12-17), 2=Evening (17-21), 3=Night (21-5)
function calculateMoodHeatmap(entries) {
  // Collect all mood data points: from full entries (mood_after) + quick mood logs
  const dataPoints = [];

  entries.forEach(e => {
    if (e.mood_after != null) {
      dataPoints.push({ date: new Date(e.date), mood: e.mood_after });
    } else if (e.mood_before != null) {
      dataPoints.push({ date: new Date(e.date), mood: e.mood_before });
    }
  });

  const moodLogs = getMoodLogs();
  moodLogs.forEach(l => {
    dataPoints.push({ date: new Date(l.date), mood: l.mood });
  });

  if (dataPoints.length < 5) return null; // not enough data

  // Build 7×4 grid
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 4 }, () => ({ sum: 0, count: 0 })));

  dataPoints.forEach(p => {
    const day = p.date.getDay();
    const h = p.date.getHours();
    let slot;
    if (h >= 5 && h < 12) slot = 0;
    else if (h >= 12 && h < 17) slot = 1;
    else if (h >= 17 && h < 21) slot = 2;
    else slot = 3; // night
    grid[day][slot].sum += p.mood;
    grid[day][slot].count++;
  });

  // Convert to { avg, count }
  return grid.map(row => row.map(cell => {
    if (cell.count === 0) return null;
    return { avg: cell.sum / cell.count, count: cell.count };
  }));
}

function renderMoodHeatmapSection(heatmap) {
  if (!heatmap) return '';

  // Count how many cells have data — need at least 5 unique cells for a meaningful visual
  const filledCells = heatmap.flat().filter(c => c !== null).length;
  if (filledCells < 5) return '';

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slotLabels = ['Morning', 'Afternoon', 'Evening', 'Night'];
  const slotIcons = ['🌅', '☀️', '🌆', '🌙'];

  // Compute color for each cell based on avg mood
  // Mood 0 (😔) = #c56b8a (pink/red), 4 (😄) = #2D7A5F (sage)
  const moodToColor = (mood) => {
    const clamped = Math.max(0, Math.min(4, mood));
    const t = clamped / 4;
    // Interpolate: struggling (soft red) → okay (warm tan) → great (sage)
    const r = Math.round(197 * (1 - t) + 45 * t);
    const g = Math.round(107 * (1 - t) + 122 * t);
    const b = Math.round(138 * (1 - t) + 95 * t);
    return `rgb(${r},${g},${b})`;
  };

  // Find best/worst cells for insight (need 2+ data points)
  let bestCell = null, worstCell = null;
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < 4; s++) {
      const cell = heatmap[d][s];
      if (!cell || cell.count < 2) continue;
      if (!bestCell || cell.avg > bestCell.avg) bestCell = { ...cell, day: d, slot: s };
      if (!worstCell || cell.avg < worstCell.avg) worstCell = { ...cell, day: d, slot: s };
    }
  }

  let insightHtml = '';
  if (bestCell && worstCell && bestCell.avg - worstCell.avg >= 1) {
    insightHtml = `
      <div class="mheatmap-insight">
        <div class="mheatmap-insight-item">
          <span class="mheatmap-insight-emoji">${MOODS[Math.round(bestCell.avg)].e}</span>
          <div>
            <div class="mheatmap-insight-label">Best time</div>
            <div class="mheatmap-insight-value">${dayLabels[bestCell.day]} ${slotLabels[bestCell.slot]}s</div>
          </div>
        </div>
        <div class="mheatmap-insight-item">
          <span class="mheatmap-insight-emoji">${MOODS[Math.round(worstCell.avg)].e}</span>
          <div>
            <div class="mheatmap-insight-label">Hardest time</div>
            <div class="mheatmap-insight-value">${dayLabels[worstCell.day]} ${slotLabels[worstCell.slot]}s</div>
          </div>
        </div>
      </div>`;
  }

  // Build header row: empty cell + 7 day labels
  const headerRow = `
    <div class="mheatmap-cell mheatmap-corner"></div>
    ${dayLabels.map(d => `<div class="mheatmap-day-label">${d}</div>`).join('')}
  `;

  // Build 4 rows (one per time slot)
  const slotRows = slotLabels.map((slot, s) => {
    const cells = [];
    cells.push(`<div class="mheatmap-slot-label"><span class="mheatmap-slot-icon">${slotIcons[s]}</span><span>${slot}</span></div>`);
    for (let d = 0; d < 7; d++) {
      const cell = heatmap[d][s];
      if (!cell) {
        cells.push(`<div class="mheatmap-cell mheatmap-empty"></div>`);
      } else {
        const color = moodToColor(cell.avg);
        const opacity = 0.3 + Math.min(cell.count / 5, 0.7); // more samples = more opaque
        cells.push(`<div class="mheatmap-cell mheatmap-filled" style="background:${color};opacity:${opacity};" title="${dayLabels[d]} ${slot}: ${MOODS[Math.round(cell.avg)].label} (${cell.count} check-in${cell.count === 1 ? '' : 's'})"></div>`);
      }
    }
    return cells.join('');
  }).join('');

  return `
    <div class="ins-section">
      <div class="ins-section-title">Mood by time</div>
      <div class="mheatmap-card">
        <div class="mheatmap-grid">
          ${headerRow}
          ${slotRows}
        </div>
        <div class="mheatmap-legend-row">
          <span class="mheatmap-legend-swatch" style="background:${moodToColor(0)};"></span>
          <span class="mheatmap-legend-label">Struggling</span>
          <span class="mheatmap-legend-arrow">→</span>
          <span class="mheatmap-legend-swatch" style="background:${moodToColor(4)};"></span>
          <span class="mheatmap-legend-label">Great</span>
        </div>
      </div>
      ${insightHtml}
    </div>`;
}

// Returns array of { word, count } sorted by frequency
function calculateTopWords(entries, limit = 25) {
  // Stop words to exclude — common filler
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with','my','i','me','was',
    'is','are','were','have','had','has','that','this','it','be','been','not','so','if','as',
    'do','did','what','how','just','like','very','from','about','when','who','which','can','will',
    'would','could','should','than','then','there','their','they','we','our','your','you','he',
    'she','his','her','him','its','all','one','out','up','by','more','also','am','into','get',
    'got','no','any','really','feel','feeling','felt','today','day','time','things','thing',
    'some','been','im','ive','dont','youre','theres','isnt','wasnt','because','being','going',
    'make','made','makes','know','knew','want','wanted','something','someone','anything',
    'nothing','everything','much','many','most','even','such','still','now','here','over',
    'down','off','only','own','same','other','well','way','say','said','see','saw','come',
    'came','think','thought','though','lot','bit','take','took','good','bad','okay','ok',
    'yes','yeah','nope','lol','haha','maybe','kinda','sorta','gonna','wanna','cant','wont',
    'didnt', 'doesnt','shouldnt','wouldnt','couldnt','hasnt','havent','hadnt'
  ]);

  const counts = {};
  entries.forEach(e => {
    (e.answers || []).forEach(a => {
      if (!a) return;
      a.toLowerCase()
        .replace(/[^a-z\s']/g, ' ')  // keep apostrophes, strip other punctuation
        .replace(/'/g, '')            // then drop apostrophes too
        .split(/\s+/)
        .forEach(w => {
          if (w.length < 4) return;   // require 4+ chars
          if (stopWords.has(w)) return;
          counts[w] = (counts[w] || 0) + 1;
        });
    });
  });

  return Object.entries(counts)
    .filter(([, c]) => c >= 2)       // require word to appear at least twice
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function openInsights() {
  const insights = calculateInsights();
  if (!insights) {
    alert('Complete your first entry to see your insights.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'insights-overlay';
  overlay.className = 'insights-overlay';

  // Day of week mini bar chart
  const maxDayCount = Math.max(...insights.dayOfWeekCounts, 1);
  const dayLabelsShort = ['S','M','T','W','T','F','S'];
  const dayBarsHtml = insights.dayOfWeekCounts.map((count, i) => {
    const pct = (count / maxDayCount) * 100;
    return `<div class="ins-day-bar-col">
      <div class="ins-day-bar-wrap">
        <div class="ins-day-bar" style="height:${pct}%;"></div>
      </div>
      <div class="ins-day-label">${dayLabelsShort[i]}</div>
      <div class="ins-day-count">${count}</div>
    </div>`;
  }).join('');

  // Tag breakdown
  let tagsHtml = '';
  if (insights.tagBreakdown.length > 0) {
    const totalTagged = insights.tagBreakdown.reduce((s,[,c]) => s + c, 0);
    tagsHtml = `<div class="ins-section">
      <div class="ins-section-title">Tag breakdown</div>
      ${insights.tagBreakdown.map(([tag, count]) => {
        const pct = Math.round((count / totalTagged) * 100);
        const tagInfo = ENTRY_TAGS[tag];
        return `<div class="ins-tag-row">
          <div class="ins-tag-info">
            <span class="ins-tag-dot" style="background:${tagInfo.color};"></span>
            <span class="ins-tag-name">${tagInfo.label}</span>
            <span class="ins-tag-desc">${tagInfo.desc}</span>
          </div>
          <div class="ins-tag-bar-wrap">
            <div class="ins-tag-bar" style="width:${pct}%;background:${tagInfo.color};"></div>
          </div>
          <div class="ins-tag-count">${count}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // Mood section
  let moodHtml = '';
  if (insights.avgLift != null && insights.avgMoodAfter != null) {
    const liftSign = insights.avgLift > 0 ? '+' : '';
    const liftColor = insights.avgLift > 0 ? 'var(--sage)' : insights.avgLift < 0 ? '#c56b8a' : 'var(--ink-60)';
    moodHtml = `<div class="ins-section">
      <div class="ins-section-title">Mood patterns</div>
      <div class="ins-mood-card">
        <div class="ins-mood-stat">
          <span class="ins-mood-emoji">${MOODS[Math.round(insights.avgMoodAfter)].e}</span>
          <span class="ins-mood-label">Average mood after journaling</span>
        </div>
        <div class="ins-mood-stat">
          <span class="ins-mood-lift" style="color:${liftColor};">${liftSign}${insights.avgLift}</span>
          <span class="ins-mood-label">Average mood lift per session</span>
        </div>
      </div>
    </div>`;
  }

  overlay.innerHTML = `
    <div class="insights-modal">
      <div class="insights-header">
        <div class="insights-title-block">
          <div class="insights-eyebrow">Your insights</div>
          <div class="insights-title">${insights.daysSinceFirst} days of practice</div>
        </div>
        <button class="insights-close" onclick="closeInsights()">✕</button>
      </div>

      <div class="ins-section">
        <div class="ins-section-title">All-time totals</div>
        <div class="ins-totals-grid">
          <div class="ins-total-card ins-total-primary">
            <div class="ins-total-val">${insights.totalMinutes}</div>
            <div class="ins-total-key">minutes on yourself</div>
          </div>
          <div class="ins-total-card">
            <div class="ins-total-val">${insights.totalWords.toLocaleString()}</div>
            <div class="ins-total-key">words written</div>
          </div>
          <div class="ins-total-card">
            <div class="ins-total-val">${insights.totalEntries}</div>
            <div class="ins-total-key">entries</div>
          </div>
          <div class="ins-total-card">
            <div class="ins-total-val">${insights.bestStreak}</div>
            <div class="ins-total-key">best streak (days)</div>
          </div>
        </div>
      </div>

      ${moodHtml}

      ${renderMoodHeatmapSection(calculateMoodHeatmap(getEntries()))}

      <div class="ins-section">
        <div class="ins-section-title">When you journal</div>
        <div class="ins-when-cards">
          <div class="ins-when-card">
            <div class="ins-when-icon">📅</div>
            <div class="ins-when-info">
              <div class="ins-when-val">${insights.bestDay}</div>
              <div class="ins-when-key">your most active day</div>
            </div>
          </div>
          <div class="ins-when-card">
            <div class="ins-when-icon">🕐</div>
            <div class="ins-when-info">
              <div class="ins-when-val">${insights.timeOfDay}</div>
              <div class="ins-when-key">your favorite time</div>
            </div>
          </div>
        </div>
        <div class="ins-day-bars">${dayBarsHtml}</div>
      </div>

      ${renderWordCloudSection(insights.topWords)}

      ${tagsHtml}

      <div class="ins-footer-msg">
        <strong>${insights.totalMinutes} minutes</strong> of your life dedicated to yourself.
        That's the kind of investment that compounds.
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Lock body scroll
  document.body.style.overflow = 'hidden';
}

function renderWordCloudSection(topWords) {
  if (!topWords || topWords.length < 5) return '';

  const maxCount = topWords[0].count;
  const minCount = topWords[topWords.length - 1].count;
  const range = Math.max(1, maxCount - minCount);

  // Color rotation — cycle through a pleasing palette of related sage/earth tones
  const colors = ['#2D7A5F', '#5B4A8A', '#C97B3D', '#1E6A8A', '#8A3030', '#7BBDA4', '#D4B95C', '#9A6520'];

  // Shuffle deterministically (same input = same output so it doesn't jump around on re-render)
  const shuffled = [...topWords].sort((a, b) => {
    // Weight so bigger words come first, but slightly mix so the visual isn't pure descending
    return (b.count - a.count) + (Math.random() - 0.5) * 0.3;
  });

  return `
    <div class="ins-section">
      <div class="ins-section-title">Your words</div>
      <div class="word-cloud-wrap">
        ${shuffled.map((w, i) => {
          // Scale font size from 13px (least common) to 30px (most common)
          const scale = (w.count - minCount) / range;
          const fontSize = 13 + Math.round(scale * 17);
          const weight = scale > 0.6 ? 600 : scale > 0.3 ? 500 : 400;
          const color = colors[i % colors.length];
          return `<span class="word-cloud-word" style="font-size:${fontSize}px;font-weight:${weight};color:${color};" title="${w.count}×">${esc(w.word)}</span>`;
        }).join('')}
      </div>
      <div class="word-cloud-caption">The themes of your reflections.</div>
    </div>`;
}

function closeInsights() {
  const o = document.getElementById('insights-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
}


const JAR_UNLOCK_MIN_ENTRIES = 5; // need 5+ entries to unlock

function openGratitudeJar() {
  const es = getEntries();
  if (es.length < JAR_UNLOCK_MIN_ENTRIES) {
    showJarLocked(es.length);
    return;
  }
  pickRandomMemory();
}

function showJarLocked(count) {
  const remaining = JAR_UNLOCK_MIN_ENTRIES - count;
  const overlay = document.createElement('div');
  overlay.id = 'jar-overlay';
  overlay.className = 'jar-overlay';
  overlay.innerHTML = `
    <div class="jar-modal jar-locked">
      <button class="jar-close" onclick="closeGratitudeJar()">✕</button>
      <div class="jar-locked-icon">🍯</div>
      <div class="jar-locked-title">Your jar is filling up</div>
      <div class="jar-locked-sub">Write ${remaining} more ${remaining === 1 ? 'entry' : 'entries'} to unlock the jar. Then come back any time to discover a random memory.</div>
      <div class="jar-progress-bar">
        <div class="jar-progress-fill" style="width:${(count/JAR_UNLOCK_MIN_ENTRIES)*100}%;"></div>
      </div>
      <div class="jar-progress-text">${count} of ${JAR_UNLOCK_MIN_ENTRIES} entries</div>
      <button class="btn solid" onclick="closeGratitudeJar()" style="margin-top:1rem;">Got it</button>
    </div>`;
  document.body.appendChild(overlay);
}

function pickRandomMemory() {
  const es = getEntries();
  if (es.length === 0) return;

  // Filter to entries that have actual content
  const filledEntries = es.filter(e => (e.answers || []).some(a => a && a.trim().length > 5));
  if (filledEntries.length === 0) return;

  const randomEntry = filledEntries[Math.floor(Math.random() * filledEntries.length)];
  showRandomMemory(randomEntry);
}

function showRandomMemory(entry) {
  // Remove existing overlay if any
  const existing = document.getElementById('jar-overlay');
  if (existing) existing.remove();

  const date = new Date(entry.date);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Days ago
  const today = new Date(); today.setHours(0,0,0,0);
  const entryDay = new Date(entry.date); entryDay.setHours(0,0,0,0);
  const daysAgo = Math.floor((today - entryDay) / (24*60*60*1000));
  let timeLabel;
  if (daysAgo === 0) timeLabel = 'Today';
  else if (daysAgo === 1) timeLabel = 'Yesterday';
  else if (daysAgo < 7) timeLabel = `${daysAgo} days ago`;
  else if (daysAgo < 30) timeLabel = `${Math.floor(daysAgo / 7)} ${Math.floor(daysAgo/7) === 1 ? 'week' : 'weeks'} ago`;
  else if (daysAgo < 365) timeLabel = `${Math.floor(daysAgo / 30)} ${Math.floor(daysAgo/30) === 1 ? 'month' : 'months'} ago`;
  else timeLabel = `${Math.floor(daysAgo / 365)} ${Math.floor(daysAgo/365) === 1 ? 'year' : 'years'} ago`;

  // Get first non-empty answer with its question
  const answers = entry.answers || [];
  const questions = entry.questions || [];
  let q = '', a = '';
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] && answers[i].trim().length > 5) {
      q = questions[i] || '';
      a = answers[i];
      break;
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'jar-overlay';
  overlay.className = 'jar-overlay';
  overlay.innerHTML = `
    <div class="jar-modal">
      <button class="jar-close" onclick="closeGratitudeJar()">✕</button>
      <div class="jar-eyebrow">
        <span class="jar-sparkle">✨</span>
        <span>From your jar</span>
      </div>
      <div class="jar-time-label">${timeLabel}</div>
      <div class="jar-date-label">${dateLabel}</div>
      <div class="jar-question">${esc(q)}</div>
      <div class="jar-answer">"${esc(a)}"</div>
      <div class="jar-actions">
        <button class="btn" onclick="pickRandomMemory()">✨ Show another</button>
        <button class="btn solid" onclick="closeGratitudeJar()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function closeGratitudeJar() {
  const o = document.getElementById('jar-overlay');
  if (o) o.remove();
}


const AFFIRMATIONS = {
  stress: [
    "I am safe in this moment. The present is enough.",
    "I release what I cannot control and trust what I can.",
    "My nervous system knows how to find calm. I let it.",
    "I have survived every difficult day before this one.",
    "Slowing down is productive. Rest is part of the work.",
    "I am allowed to set boundaries that protect my peace.",
    "I do not have to earn rest. I am worthy of it.",
    "The pace of my breath sets the pace of my mind.",
    "I am not my thoughts. I am the awareness behind them.",
    "Today, I choose what I can carry and what I set down.",
    "I trust that I am capable of handling what arrives.",
    "My worth is not measured by my productivity.",
    "Worry is not preparation. I focus on what's real.",
    "I deserve the same compassion I give to others.",
    "This feeling is temporary. I have weathered worse.",
    "I do not need to be fine to be okay.",
    "It is safe for me to let my shoulders drop.",
    "I am exactly where I need to be in this moment.",
    "I release the need to control every outcome.",
    "Calm is my natural state. I'm just returning to it.",
  ],
  gratitude: [
    "There is more to be thankful for than I will ever notice.",
    "I am surrounded by ordinary miracles I take for granted.",
    "The good in my life is not luck. It is real and it is mine.",
    "I notice beauty in small, easy-to-miss places today.",
    "Gratitude is not denial of difficulty — it is balance.",
    "I am rich in things money cannot buy.",
    "Today, I see what is going right.",
    "My life has been shaped by the kindness of others.",
    "I am grateful for the body that carries me through this day.",
    "The people I love are still here. That is everything.",
    "Every breath I take is a privilege.",
    "I have everything I need in this moment.",
    "Joy is found in attention, not acquisition.",
    "What I appreciate appreciates.",
    "I am blessed in ways I have not yet realized.",
    "Today contains gifts I will only see if I look.",
    "My gratitude practice is rewiring my brain.",
    "I am thankful for the lessons inside my struggles.",
    "There is grace in the ordinary moments.",
    "I notice. I appreciate. I receive.",
  ],
  clarity: [
    "I trust the wisdom within me to guide my next step.",
    "I do not need all the answers — just the next one.",
    "What I focus on grows. I focus deliberately.",
    "I am allowed to change my mind as I grow.",
    "My intuition is a trustworthy compass.",
    "I create space for clarity by slowing down.",
    "I release what no longer serves who I am becoming.",
    "I am clear about what matters most to me.",
    "I make decisions from values, not from fear.",
    "Stillness reveals what noise hides.",
    "I do not need approval to know what I want.",
    "The right path becomes obvious when I stop asking everyone else.",
    "Confusion is the first step toward clarity.",
    "I trust my own knowing.",
    "I am becoming more myself, not less.",
    "What I want is allowed to matter.",
    "I align my actions with my values today.",
    "The next right step is enough.",
    "I see clearly when I look honestly.",
    "Quiet is where my truth lives.",
  ],
  growth: [
    "I am becoming the person I am meant to be, one day at a time.",
    "My past does not define my future.",
    "Discomfort is the price of growth. I pay it willingly.",
    "I learn from everything, including my mistakes.",
    "I am proud of how far I have come.",
    "Today, I do something my future self will thank me for.",
    "I am exactly where I need to be on my path.",
    "I am not behind. I am on my own timeline.",
    "Every challenge is shaping me.",
    "I trust the process even when I cannot see it.",
    "I am evolving. I am allowed to outgrow what no longer fits.",
    "My growth is worth the temporary discomfort.",
    "I am capable of more than I currently believe.",
    "I show up for myself today, even imperfectly.",
    "I am allowed to be a beginner.",
    "Progress is not linear, and that is okay.",
    "I am building the person I want to be.",
    "I choose growth over comfort today.",
    "Each day, I am becoming.",
    "I am proud of who I am becoming.",
  ],
};

function getDailyAffirmation() {
  const goal = localStorage.getItem('gj_goal') || 'gratitude';
  const pool = AFFIRMATIONS[goal] || AFFIRMATIONS.gratitude;
  // Same affirmation all day, rotates daily
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return { text: pool[dayOfYear % pool.length], goal };
}

function getFavAffirmations() {
  if (!currentUser) return [];
  return JSON.parse(localStorage.getItem('gj_fav_affirmations_' + currentUser.id) || '[]');
}

function toggleFavAffirmation(text) {
  if (!currentUser) return;
  const key = 'gj_fav_affirmations_' + currentUser.id;
  // Normalize old format (mixed strings/objects) to plain string array
  const favs = getFavAffirmations().map(f => typeof f === 'string' ? f : f.text);
  const idx = favs.indexOf(text);
  if (idx >= 0) {
    favs.splice(idx, 1); // remove
  } else {
    favs.unshift(text); // add to top
  }
  localStorage.setItem(key, JSON.stringify(favs.slice(0, 50)));
  renderAffirmation();
}

function renderAffirmation() {
  const wrap = document.getElementById('affirmation-wrap');
  if (!wrap) return;
  const { text, goal } = getDailyAffirmation();
  const favs = getFavAffirmations();
  const isFav = favs.some(f => (typeof f === 'string' ? f : f.text) === text);

  // Don't show if user dismissed today
  const dismissed = localStorage.getItem('gj_aff_dismissed_' + new Date().toDateString());
  if (dismissed) { wrap.innerHTML = ''; return; }

  // Stash text on a global so onclick handlers can access it without escaping issues
  window._currentAffText = text;

  wrap.innerHTML = `
    <div class="affirmation-card">
      <div class="affirmation-eyebrow">
        <span>✨ Today's affirmation</span>
        <button class="affirmation-dismiss" onclick="dismissAffirmation()" title="Dismiss for today">✕</button>
      </div>
      <div class="affirmation-text">"${esc(text)}"</div>
      <div class="affirmation-actions">
        <button class="affirmation-fav-btn ${isFav ? 'is-fav' : ''}" onclick="toggleFavAffirmation(window._currentAffText)">
          ${isFav ? '♥ Saved' : '♡ Save'}
        </button>
        <button class="affirmation-share-btn" onclick="shareAffirmation(window._currentAffText)">↗ Share</button>
      </div>
    </div>`;
}

function dismissAffirmation() {
  localStorage.setItem('gj_aff_dismissed_' + new Date().toDateString(), '1');
  renderAffirmation();
}

function shareAffirmation(text) {
  // Reuse existing quote card system
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  openQuoteCard(text, dateStr);
}


const CHALLENGE_DAYS = [
  { day: 1, theme: 'People', icon: '💝', title: 'Day 1 — Someone Who Shaped You',
    desc: 'Today we focus on the people who have made you who you are.',
    questions: [
      "Who is someone who believed in you before you believed in yourself? What did they see?",
      "Name one person you'd be a completely different person without. Why?",
      "Whose voice do you still hear in your head when you face a challenge?",
      "Who taught you what love or kindness actually looks like in practice?",
      "If you could write a thank-you to one person right now, who would it be and what would it say?",
    ]},
  { day: 2, theme: 'Body', icon: '🌿', title: 'Day 2 — Your Body',
    desc: 'A day to appreciate the body that carries you through every moment.',
    questions: [
      "What's one thing your body does that you take completely for granted?",
      "Where in your body do you feel strongest right now?",
      "What's one sense — sight, smell, taste, touch, hearing — you're especially grateful for today?",
      "What has your body survived that you don't give it credit for?",
      "What's one way you could thank your body this week?",
    ]},
  { day: 3, theme: 'Place', icon: '🏠', title: 'Day 3 — Where You Are',
    desc: 'Notice and appreciate the place where your life is happening.',
    questions: [
      "What's one thing about where you live that you'd miss if you moved?",
      "Describe a corner of your home that feels most like you.",
      "What place — anywhere in the world — do you feel most like yourself in?",
      "What do you love about your neighborhood, town, or city right now?",
      "What's one ordinary view, sound, or smell from your daily life that's actually beautiful?",
    ]},
  { day: 4, theme: 'Struggle', icon: '⛰️', title: 'Day 4 — A Hidden Gift',
    desc: 'The hardest things often teach us the most. Today we look for the gift inside difficulty.',
    questions: [
      "What's one struggle from your past that you can now see was actually a turning point?",
      "What did a difficult chapter of your life teach you about yourself?",
      "What's something you'd never have learned if life had been easier?",
      "Which of your strengths came directly from going through something hard?",
      "What current challenge might be making you stronger in ways you can't see yet?",
    ]},
  { day: 5, theme: 'Small Things', icon: '☕', title: 'Day 5 — The Tiny Joys',
    desc: 'Today we slow down and notice the small things that make life worth living.',
    questions: [
      "What's a tiny pleasure — a smell, taste, sound, or feeling — you experienced today?",
      "What's one small daily ritual that brings you quiet joy?",
      "What's something you'd put in a 'jar of good moments' from the past week?",
      "What's a sound that immediately makes you feel at home?",
      "What's something free — that costs nothing — that you genuinely treasure?",
    ]},
  { day: 6, theme: 'Future Self', icon: '🌅', title: 'Day 6 — Looking Forward',
    desc: 'Gratitude isn\'t only for the past. Today we\'re grateful for what\'s ahead.',
    questions: [
      "What's one thing you're genuinely excited about in the next 6 months?",
      "What part of your life is heading in a direction you're proud of?",
      "What seed are you planting now that your future self will thank you for?",
      "What new chapter do you sense beginning?",
      "What do you want to be grateful for one year from today?",
    ]},
  { day: 7, theme: 'Yourself', icon: '✨', title: 'Day 7 — Yourself',
    desc: 'The hardest one. The most important. Today, gratitude for you.',
    questions: [
      "What's one thing about yourself that you genuinely like?",
      "What did you do well this week that you haven't acknowledged?",
      "What part of your character are you proud to have built?",
      "If a younger version of you could see who you are now, what would surprise them?",
      "What's one thing you can thank yourself for today?",
    ]},
];

function getChallengeData() {
  if (!currentUser) return { active: false, day: 0, completed: [] };
  const data = JSON.parse(localStorage.getItem('gj_challenge_' + currentUser.id) || 'null');
  return data || { active: false, day: 0, completed: [], startDate: null };
}

function saveChallengeData(data) {
  if (!currentUser) return;
  localStorage.setItem('gj_challenge_' + currentUser.id, JSON.stringify(data));
}

function startChallenge() {
  const data = { active: true, day: 1, completed: [], startDate: Date.now() };
  saveChallengeData(data);
  renderChallenge();
  alert('🌟 7-Day Gratitude Challenge started! Begin Day 1 whenever you\'re ready.');
}

function endChallenge() {
  if (!confirm('Are you sure you want to leave the challenge? Your progress will be saved.')) return;
  const data = getChallengeData();
  data.active = false;
  saveChallengeData(data);
  renderChallenge();
}

function startChallengeDay() {
  const data = getChallengeData();
  if (!data.active) return;
  const dayData = CHALLENGE_DAYS[data.day - 1];
  if (!dayData) return;
  // Override session questions with challenge questions
  moodBefore = null; moodAfter = null;
  sessionQs = dayData.questions;
  qIdx = 0;
  qAnswers = Array(sessionQs.length).fill('');
  inputMode = 'voice';
  // Mark challenge active for this session
  window._activeChallenge = data.day;
  renderBreathOpts();
  goPage('breath');
}

function completeChallengeDay(day) {
  const data = getChallengeData();
  if (!data.completed.includes(day)) {
    data.completed.push(day);
  }
  if (day < 7) {
    data.day = day + 1;
  } else {
    // Challenge complete!
    data.active = false;
    data.day = 7;
    setTimeout(() => {
      alert('🎉 You completed the 7-Day Gratitude Challenge! Take a moment to feel proud of what you just built.');
    }, 1500);
  }
  saveChallengeData(data);
  window._activeChallenge = null;
}

function renderChallenge() {
  const wrap = document.getElementById('challenge-wrap');
  if (!wrap) return;
  const data = getChallengeData();

  if (!data.active && data.completed.length === 0) {
    // Promote — invite to start
    wrap.innerHTML = `
      <div class="challenge-card challenge-promo">
        <div class="challenge-promo-icon">🌟</div>
        <div class="challenge-promo-title">7-Day Gratitude Challenge</div>
        <div class="challenge-promo-sub">A guided journey through 7 themes — people, body, place, struggle, small things, future, and yourself.</div>
        <button class="challenge-start-btn" onclick="startChallenge()">Begin the challenge →</button>
      </div>`;
    return;
  }

  if (!data.active && data.completed.length === 7) {
    // Already completed
    wrap.innerHTML = `
      <div class="challenge-card challenge-done">
        <div class="challenge-promo-icon">🏆</div>
        <div class="challenge-promo-title">Challenge complete</div>
        <div class="challenge-promo-sub">You finished the 7-Day Gratitude Challenge. That's something to be proud of.</div>
        <button class="challenge-start-btn" onclick="restartChallenge()">Start it again →</button>
      </div>`;
    return;
  }

  if (!data.active) {
    // Paused — show resume button
    wrap.innerHTML = `
      <div class="challenge-card">
        <div class="challenge-head">
          <div class="challenge-eyebrow">7-Day Challenge</div>
          <button class="challenge-end-btn" onclick="restartChallenge()">Restart</button>
        </div>
        <div class="challenge-progress-text">Paused on Day ${data.day} · ${data.completed.length}/7 complete</div>
        <button class="challenge-start-btn" onclick="resumeChallenge()">Resume challenge →</button>
      </div>`;
    return;
  }

  // Active — show today's day
  const dayData = CHALLENGE_DAYS[data.day - 1];
  if (!dayData) return;
  const isDayDone = data.completed.includes(data.day);

  wrap.innerHTML = `
    <div class="challenge-card challenge-active">
      <div class="challenge-head">
        <div class="challenge-eyebrow">Challenge · Day ${data.day} of 7</div>
        <button class="challenge-end-btn" onclick="endChallenge()">Pause</button>
      </div>
      <div class="challenge-day-title">${dayData.icon} ${dayData.title}</div>
      <div class="challenge-day-desc">${dayData.desc}</div>
      <div class="challenge-progress-bar">
        ${[1,2,3,4,5,6,7].map(d => `<div class="challenge-dot ${data.completed.includes(d) ? 'done' : d === data.day ? 'current' : ''}"></div>`).join('')}
      </div>
      ${isDayDone
        ? `<div class="challenge-done-msg">✓ Day ${data.day} complete. Come back tomorrow for Day ${Math.min(data.day + 1, 7)}.</div>`
        : `<button class="challenge-start-btn" onclick="startChallengeDay()">Begin Day ${data.day} →</button>`}
    </div>`;
}

function resumeChallenge() {
  const data = getChallengeData();
  data.active = true;
  saveChallengeData(data);
  renderChallenge();
}

function restartChallenge() {
  if (!confirm('Restart the 7-Day Gratitude Challenge from Day 1?')) return;
  saveChallengeData({ active: true, day: 1, completed: [], startDate: Date.now() });
  renderChallenge();
}


// ── WHAT'S NEW TOUR ────────────────────────────────
// Version is bumped manually when new features ship. Returning users
// who haven't seen the current version's tour get a gentle "What's new" modal.
const WHATS_NEW_VERSION = '2026.04.18';

// Each item is a feature we want to highlight. Keep to 3-5 — any more feels spammy.
const WHATS_NEW_ITEMS = [
  {
    icon: '💭',
    title: 'Quick Capture',
    sub: 'A thought you don\'t want to lose? Tap the 💭 button on Home — type or speak it in 30 seconds.',
    color: '#2D7A5F',
  },
  {
    icon: '📱',
    title: 'Shake to Capture',
    sub: 'Shake your phone anywhere in the app to instantly open Quick Capture. Enable in Settings.',
    color: '#9A6520',
  },
  {
    icon: '❤️',
    title: 'Apple Health',
    sub: 'Log your sessions as Mindful Minutes automatically — alongside your workouts and sleep.',
    color: '#E54B4B',
  },
  {
    icon: '☁️',
    title: 'Mood Log Chart',
    sub: 'See your mood trend over the past 14 days right on Home. Patterns emerge.',
    color: '#5B8BBF',
  },
  {
    icon: '✨',
    title: 'Your Words',
    sub: 'Tap any stat tile to see a word cloud of your most-used words — the themes of your reflections.',
    color: '#8557B2',
  },
];

function maybeShowWhatsNew() {
  if (!currentUser) return;

  // Don't show to brand-new users — they just onboarded, no point showing them "what's new"
  const onboardedAt = localStorage.getItem('gj_onboarded_at_' + currentUser.id);
  const now = Date.now();
  if (!onboardedAt) {
    // Stamp onboarded time if missing (migration for existing users)
    localStorage.setItem('gj_onboarded_at_' + currentUser.id, String(now));
    return;
  }
  const ageDays = (now - parseInt(onboardedAt, 10)) / (24 * 60 * 60 * 1000);
  if (ageDays < 2) return; // must have used the app at least 2 days

  // Already seen this version?
  if (localStorage.getItem('gj_whats_new_' + WHATS_NEW_VERSION + '_' + currentUser.id) === '1') return;

  // Don't interrupt a session
  const activePage = document.querySelector('.page.active')?.id;
  if (['page-journal', 'page-mood-before', 'page-mood-after', 'page-breath', 'page-breathex', 'page-summary'].includes(activePage)) {
    setTimeout(() => maybeShowWhatsNew(), 30000);
    return;
  }

  // Don't stack on top of other overlays
  if (document.getElementById('health-prompt-overlay') ||
      document.getElementById('quick-capture-overlay') ||
      document.querySelector('.modal-overlay.open')) {
    setTimeout(() => maybeShowWhatsNew(), 8000);
    return;
  }

  showWhatsNew();
}

function showWhatsNew() {
  const overlay = document.createElement('div');
  overlay.id = 'whats-new-overlay';
  overlay.className = 'whats-new-overlay';
  overlay.innerHTML = `
    <div class="whats-new-modal">
      <button class="whats-new-close" onclick="dismissWhatsNew()">✕</button>

      <div class="whats-new-hero">
        <div class="whats-new-sparkle">✨</div>
        <div class="whats-new-eyebrow">Fresh updates</div>
        <div class="whats-new-title">What's new in Gratitude</div>
        <div class="whats-new-sub">Here's what we've added while you were away.</div>
      </div>

      <div class="whats-new-list">
        ${WHATS_NEW_ITEMS.map((item, i) => `
          <div class="whats-new-item" style="animation-delay: ${0.15 + i * 0.08}s;">
            <div class="whats-new-icon" style="background: ${item.color}20; color: ${item.color};">
              ${item.icon}
            </div>
            <div class="whats-new-content">
              <div class="whats-new-item-title">${esc(item.title)}</div>
              <div class="whats-new-item-sub">${esc(item.sub)}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="whats-new-actions">
        <button class="btn solid whats-new-primary" onclick="dismissWhatsNew()">Start exploring →</button>
      </div>

      <div class="whats-new-footnote">
        Thanks for being here since the early days. 💙
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function dismissWhatsNew() {
  if (currentUser) {
    localStorage.setItem('gj_whats_new_' + WHATS_NEW_VERSION + '_' + currentUser.id, '1');
  }
  const o = document.getElementById('whats-new-overlay');
  if (o) {
    o.classList.add('fade-out');
    setTimeout(() => {
      o.remove();
      document.body.style.overflow = '';
    }, 300);
  }
}


// Logs Mindful Minutes to Apple Health on each completed session.
// Uses @capgo/capacitor-health via window.Capacitor.Plugins (same pattern as
// LocalNotifications and SpeechRecognition — works inside Capacitor WebView).

function getHealthPlugin() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return null;
  // Plugin registers itself as "Health" on window.Capacitor.Plugins
  return window.Capacitor?.Plugins?.Health || null;
}

async function isHealthAuthorized() {
  if (!currentUser) return false;
  return localStorage.getItem('gj_health_auth_' + currentUser.id) === '1';
}

async function requestHealthPermission() {
  const Health = getHealthPlugin();
  if (!Health) return { ok: false, reason: 'plugin' };
  try {
    // Check availability first
    const avail = await Health.isAvailable();
    if (!avail || !avail.available) return { ok: false, reason: 'unavailable' };

    // @capgo/capacitor-health uses lowercase data type names
    await Health.requestAuthorization({
      read: ['mindfulness'],
      write: ['mindfulness'],
    });

    if (currentUser) localStorage.setItem('gj_health_auth_' + currentUser.id, '1');
    return { ok: true };
  } catch(e) {
    console.log('Health permission error:', e?.message);
    return { ok: false, reason: 'denied', error: e?.message };
  }
}

async function logMindfulMinutesToHealth(entryDate, durationMinutes) {
  if (!await isHealthAuthorized()) return;
  const Health = getHealthPlugin();
  if (!Health) return;
  try {
    const start = new Date(entryDate);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    await Health.saveSample({
      dataType: 'mindfulness',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  } catch(e) {
    console.log('Health log failed:', e?.message);
  }
}

function estimateSessionMinutes(entry) {
  const totalWords = (entry.answers || []).reduce((s, a) => s + (a ? a.trim().split(/\s+/).filter(Boolean).length : 0), 0);
  return Math.max(3, Math.round(totalWords / 80));
}

async function disconnectHealth() {
  if (!currentUser) return;
  localStorage.removeItem('gj_health_auth_' + currentUser.id);
}

// Pre-permission explainer shown once on first launch.
// This improves acceptance rates — iOS only lets you ask once, so we want the user
// to understand WHY before the native popup appears.
async function promptHealthOnFirstLaunch() {
  // Skip if already asked, not on iOS, or plugin not installed
  if (!currentUser) return;
  if (localStorage.getItem('gj_health_asked_' + currentUser.id)) return;
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;
  const Health = getHealthPlugin();
  if (!Health) return;

  // Don't prompt if user is mid-session
  const activePage = document.querySelector('.page.active')?.id;
  if (['page-journal', 'page-mood-before', 'page-mood-after', 'page-breath', 'page-breathex'].includes(activePage)) {
    // Try again in a bit
    setTimeout(() => promptHealthOnFirstLaunch(), 30000);
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'health-prompt-overlay';
  overlay.className = 'health-prompt-overlay';
  overlay.innerHTML = `
    <div class="health-prompt-modal">
      <div class="health-prompt-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="#FF2D55"><path d="M12 21s-7-5-9-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 5-9 10-9 10z"/></svg>
      </div>
      <div class="health-prompt-title">Log to Apple Health?</div>
      <div class="health-prompt-sub">Gratitude can automatically log your completed sessions as <strong>Mindful Minutes</strong> in Apple Health — alongside your workouts, sleep, and meditation data.</div>

      <div class="health-prompt-benefits">
        <div class="health-prompt-benefit">
          <span class="health-prompt-check">✓</span>
          <span>Builds your wellness timeline</span>
        </div>
        <div class="health-prompt-benefit">
          <span class="health-prompt-check">✓</span>
          <span>Only writes mindful minutes — never reads anything</span>
        </div>
        <div class="health-prompt-benefit">
          <span class="health-prompt-check">✓</span>
          <span>Fully private, stays on your device</span>
        </div>
      </div>

      <div class="health-prompt-actions">
        <button class="btn" onclick="declineHealthPrompt()">Not now</button>
        <button class="btn solid" onclick="acceptHealthPrompt()">Connect →</button>
      </div>

      <div class="health-prompt-footnote">You can change this any time in Settings.</div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function declineHealthPrompt() {
  if (currentUser) localStorage.setItem('gj_health_asked_' + currentUser.id, '1');
  const o = document.getElementById('health-prompt-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
}

async function acceptHealthPrompt() {
  const btn = document.querySelector('#health-prompt-overlay .btn.solid');
  if (btn) { btn.disabled = true; btn.textContent = 'Requesting…'; }

  const result = await requestHealthPermission();
  // Mark asked regardless of outcome — iOS won't show native popup twice
  if (currentUser) localStorage.setItem('gj_health_asked_' + currentUser.id, '1');

  const o = document.getElementById('health-prompt-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';

  if (result.ok) {
    // Subtle confirmation toast
    const toast = document.createElement('div');
    toast.className = 'quick-capture-toast';
    toast.innerHTML = `<span class="quick-capture-toast-check">✓</span><span>Apple Health connected</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 400); }, 2200);
  }

  // Refresh settings if visible
  if (document.getElementById('page-settings')?.classList.contains('active')) renderSettings();
}


let shakeInitialized = false;
let shakeLastX = 0, shakeLastY = 0, shakeLastZ = 0;
let shakeLastTime = 0;
let shakeLastFireTime = 0;
const SHAKE_THRESHOLD = 18; // m/s² delta — tuned to require deliberate shake
const SHAKE_COOLDOWN = 2000; // ms between shake triggers

async function initShakeDetection() {
  if (shakeInitialized) return;

  // Respect user preference
  if (localStorage.getItem('gj_shake_disabled') === '1') return;

  // iOS 13+ requires explicit permission for DeviceMotion
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    // Don't auto-prompt — wait until user has been in app long enough that a permission popup makes sense
    // We'll request on first qualifying interaction. For now, just check if already granted.
    // The actual request happens via askShakePermission() called from settings.
    try {
      // Some older iOS versions return granted by default if no Info.plist key
      const permission = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
      if (permission !== 'granted') return;
    } catch(e) { return; }
  }

  if (typeof DeviceMotionEvent === 'undefined') return;

  window.addEventListener('devicemotion', onShakeMotion);
  shakeInitialized = true;
}

function onShakeMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc || acc.x == null) return;

  const now = Date.now();
  // Throttle to ~10 samples per second for performance
  if (now - shakeLastTime < 100) return;
  const elapsed = now - shakeLastTime;
  shakeLastTime = now;

  const deltaX = Math.abs(acc.x - shakeLastX);
  const deltaY = Math.abs(acc.y - shakeLastY);
  const deltaZ = Math.abs(acc.z - shakeLastZ);

  shakeLastX = acc.x;
  shakeLastY = acc.y;
  shakeLastZ = acc.z;

  // Need movement on at least 2 axes to count as a real shake (not a phone drop or single tap)
  const totalDelta = (deltaX + deltaY + deltaZ);
  const axesMoving = [deltaX, deltaY, deltaZ].filter(d => d > 6).length;

  if (totalDelta > SHAKE_THRESHOLD && axesMoving >= 2) {
    if (now - shakeLastFireTime < SHAKE_COOLDOWN) return;
    shakeLastFireTime = now;
    onShakeDetected();
  }
}

function onShakeDetected() {
  // Don't fire if user is in middle of a session, mood check-in, breath, or already in a modal
  const activePage = document.querySelector('.page.active')?.id;
  const inSession = ['journal', 'mood-before', 'mood-after', 'breath', 'breathex'].includes(activePage?.replace('page-', ''));
  if (inSession) return;

  // Don't fire if any modal/overlay is already open
  if (document.getElementById('quick-capture-overlay')) return;
  if (document.getElementById('insights-overlay')) return;
  if (document.getElementById('achievements-overlay')) return;
  if (document.getElementById('year-review-overlay')) return;
  if (document.getElementById('jar-overlay')) return;
  if (document.getElementById('photo-fullscreen-overlay')) return;
  if (document.querySelector('.modal-overlay.open')) return;

  // Light haptic feel via subtle screen flash
  showShakeFeedback();

  // Open quick capture
  if (typeof openQuickCapture === 'function') openQuickCapture();
}

function showShakeFeedback() {
  // Brief sage flash to acknowledge the shake
  const flash = document.createElement('div');
  flash.className = 'shake-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);
}

// Manual permission request — used if user enables shake from settings
async function askShakePermission() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission === 'granted') {
        localStorage.removeItem('gj_shake_disabled');
        window.addEventListener('devicemotion', onShakeMotion);
        shakeInitialized = true;
        return true;
      }
      return false;
    } catch(e) { return false; }
  }
  // No permission needed
  localStorage.removeItem('gj_shake_disabled');
  if (!shakeInitialized) {
    window.addEventListener('devicemotion', onShakeMotion);
    shakeInitialized = true;
  }
  return true;
}

function disableShake() {
  localStorage.setItem('gj_shake_disabled', '1');
  if (shakeInitialized) {
    window.removeEventListener('devicemotion', onShakeMotion);
    shakeInitialized = false;
  }
}


const QUICK_PROMPTS = [
  "What just happened that you want to remember?",
  "What's on your mind right now?",
  "Capture this moment — what stands out?",
  "What are you noticing?",
  "What's the thought you don't want to lose?",
  "What just shifted for you?",
  "Speak it before you forget it.",
  "What do you want future-you to know?",
];

function openQuickCapture() {
  const prompt = QUICK_PROMPTS[Math.floor(Math.random() * QUICK_PROMPTS.length)];
  // Reset state each time we open
  qcMode = 'voice';
  qcAccumulated = '';
  const overlay = document.createElement('div');
  overlay.id = 'quick-capture-overlay';
  overlay.className = 'quick-capture-overlay';
  overlay.innerHTML = `
    <div class="quick-capture-modal">
      <button class="quick-capture-close" onclick="closeQuickCapture()">✕</button>
      <div class="quick-capture-eyebrow">💭 Quick thought</div>
      <div class="quick-capture-prompt">${esc(prompt)}</div>

      <div class="qc-mode-switch">
        <button class="qc-mode-btn" id="qc-mode-text" onclick="qcSetMode('text')">⌨️ Type</button>
        <button class="qc-mode-btn active" id="qc-mode-voice" onclick="qcSetMode('voice')">🎙 Speak</button>
      </div>

      <div id="qc-input-zone">
        <div class="qc-voice-wrap">
          <div class="qc-mic-ring" id="qc-mic-ring"
            onmousedown="qcStartVoice()" onmouseup="qcStopVoice()" onmouseleave="qcStopVoice()"
            ontouchstart="event.preventDefault();qcStartVoice()" ontouchend="event.preventDefault();qcStopVoice()" ontouchcancel="event.preventDefault();qcStopVoice()">
            <svg class="qc-mic-svg" viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 9a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V23h-2v-2.06A9 9 0 0 1 3 12h2z"/></svg>
          </div>
          <div class="qc-mic-status" id="qc-mic-status">Hold to speak</div>
          <div class="qc-voice-display blank" id="qc-voice-display">Your thought will appear here as you speak…</div>
        </div>
      </div>

      <div class="quick-capture-counter" id="quick-capture-counter">0 words</div>
      <div class="quick-capture-actions">
        <button class="btn" onclick="closeQuickCapture()">Cancel</button>
        <button class="btn solid" id="quick-capture-save" onclick="saveQuickCapture()" disabled>Save thought →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  // Stash prompt for save
  overlay.dataset.prompt = prompt;
}

// Track current quick capture mode and recording state
let qcMode = 'voice';
let qcRecOn = false;
let qcAccumulated = '';

function qcWireTextarea() {
  const ta = document.getElementById('quick-capture-input');
  const counter = document.getElementById('quick-capture-counter');
  const saveBtn = document.getElementById('quick-capture-save');
  if (!ta) return;
  ta.addEventListener('input', () => {
    const text = ta.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    counter.textContent = `${words} word${words === 1 ? '' : 's'}`;
    saveBtn.disabled = text.length < 3;
  });
}

function qcSetMode(mode) {
  // Save any in-progress text/voice content as we switch
  const ta = document.getElementById('quick-capture-input');
  if (ta) qcAccumulated = ta.value;
  if (qcRecOn) qcStopVoice();

  qcMode = mode;
  document.getElementById('qc-mode-text').classList.toggle('active', mode === 'text');
  document.getElementById('qc-mode-voice').classList.toggle('active', mode === 'voice');

  const zone = document.getElementById('qc-input-zone');
  if (mode === 'text') {
    zone.innerHTML = `<textarea class="quick-capture-textarea" id="quick-capture-input" placeholder="Type or paste your thought…">${esc(qcAccumulated)}</textarea>`;
    qcWireTextarea();
    qcUpdateCounter();
    setTimeout(() => document.getElementById('quick-capture-input')?.focus(), 50);
  } else {
    zone.innerHTML = `
      <div class="qc-voice-wrap">
        <div class="qc-mic-ring" id="qc-mic-ring"
          onmousedown="qcStartVoice()" onmouseup="qcStopVoice()" onmouseleave="qcStopVoice()"
          ontouchstart="event.preventDefault();qcStartVoice()" ontouchend="event.preventDefault();qcStopVoice()">
          <svg class="qc-mic-svg" viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 9a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V23h-2v-2.06A9 9 0 0 1 3 12h2z"/></svg>
        </div>
        <div class="qc-mic-status" id="qc-mic-status">${qcAccumulated ? 'Hold to add more' : 'Hold to speak'}</div>
        <div class="qc-voice-display ${qcAccumulated ? '' : 'blank'}" id="qc-voice-display">${qcAccumulated ? esc(qcAccumulated) : 'Your thought will appear here as you speak…'}</div>
      </div>`;
    qcUpdateCounter();
  }
}

function qcUpdateCounter() {
  const counter = document.getElementById('quick-capture-counter');
  const saveBtn = document.getElementById('quick-capture-save');
  const text = qcMode === 'text'
    ? (document.getElementById('quick-capture-input')?.value || '').trim()
    : qcAccumulated.trim();
  const words = text ? text.split(/\s+/).length : 0;
  if (counter) counter.textContent = `${words} word${words === 1 ? '' : 's'}`;
  if (saveBtn) saveBtn.disabled = text.length < 3;
}

async function qcStartVoice() {
  if (qcRecOn) return;

  // iOS Capacitor path
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;
      if (!SpeechRecognition) {
        const s = document.getElementById('qc-mic-status');
        if (s) s.textContent = 'Voice not available on this device';
        return;
      }
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted' && perm.microphone !== 'granted') {
        const s = document.getElementById('qc-mic-status');
        if (s) s.textContent = 'Mic denied — enable in Settings';
        return;
      }

      // Remove any stale listeners from a previous session
      try { await SpeechRecognition.removeAllListeners(); } catch(e) {}

      qcRecOn = true;
      document.getElementById('qc-mic-ring')?.classList.add('live');
      const s = document.getElementById('qc-mic-status');
      if (s) { s.textContent = 'Release to stop'; s.classList.add('recording'); }

      // Track the latest partial so we can commit it when the user releases
      let latestPartial = '';

      await SpeechRecognition.addListener('partialResults', (data) => {
        const partial = data.matches ? data.matches[0] : '';
        latestPartial = partial;
        const display = document.getElementById('qc-voice-display');
        if (display) {
          display.classList.remove('blank');
          display.textContent = (qcAccumulated ? qcAccumulated + ' ' : '') + partial;
        }
      });

      await SpeechRecognition.addListener('listeningState', (data) => {
        if (data.status === 'stopped') {
          // Commit whatever we have into the accumulated buffer
          if (latestPartial && latestPartial.trim()) {
            qcAccumulated = (qcAccumulated ? qcAccumulated + ' ' : '') + latestPartial.trim();
          }
          qcRecOn = false;
          document.getElementById('qc-mic-ring')?.classList.remove('live');
          const s2 = document.getElementById('qc-mic-status');
          if (s2) { s2.textContent = qcAccumulated ? 'Hold to add more' : 'Hold to speak'; s2.classList.remove('recording'); }
          const display = document.getElementById('qc-voice-display');
          if (display) {
            if (qcAccumulated) {
              display.classList.remove('blank');
              display.textContent = qcAccumulated;
            } else {
              display.classList.add('blank');
              display.textContent = 'Your thought will appear here as you speak…';
            }
          }
          qcUpdateCounter();
          try { SpeechRecognition.removeAllListeners(); } catch(e) {}
        }
      });

      await SpeechRecognition.start({
        language: 'en-US',
        maxResults: 2,
        prompt: 'Speak your thought',
        partialResults: true,
        popup: false,
      });
    } catch(e) {
      console.log('QC voice error:', e?.message);
      const s = document.getElementById('qc-mic-status');
      if (s) s.textContent = 'Voice not available on this device';
      qcRecOn = false;
      document.getElementById('qc-mic-ring')?.classList.remove('live');
    }
    return;
  }

  // Web fallback
  if (!SR) {
    const s = document.getElementById('qc-mic-status');
    if (s) s.textContent = 'Voice not supported in this browser';
    return;
  }
  qcRec = new SR();
  qcRec.continuous = true;
  qcRec.interimResults = true;
  qcRec.lang = 'en-US';
  qcRec.onstart = () => {
    qcRecOn = true;
    document.getElementById('qc-mic-ring')?.classList.add('live');
    const s = document.getElementById('qc-mic-status');
    if (s) { s.textContent = 'Release to stop'; s.classList.add('recording'); }
  };
  qcRec.onresult = (ev) => {
    let fin = qcAccumulated, int = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) fin = (fin ? fin + ' ' : '') + t;
      else int += t;
    }
    qcAccumulated = fin;
    const display = document.getElementById('qc-voice-display');
    if (display) {
      display.classList.remove('blank');
      display.textContent = (fin + (int ? ' ' + int : '')) || 'Your thought will appear here as you speak…';
    }
    qcUpdateCounter();
  };
  qcRec.onend = () => {
    qcRecOn = false;
    document.getElementById('qc-mic-ring')?.classList.remove('live');
    const s = document.getElementById('qc-mic-status');
    if (s) { s.textContent = qcAccumulated ? 'Hold to add more' : 'Hold to speak'; s.classList.remove('recording'); }
  };
  try { qcRec.start(); } catch(e) {}
}

let qcRec = null;

async function qcStopVoice() {
  if (!qcRecOn) return;
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;
      if (SpeechRecognition) await SpeechRecognition.stop();
    } catch(e) {}
  } else if (qcRec) {
    try { qcRec.stop(); } catch(e) {}
  }
}

function closeQuickCapture() {
  if (qcRecOn) qcStopVoice();
  qcMode = 'voice';
  qcAccumulated = '';
  qcRecOn = false;
  const o = document.getElementById('quick-capture-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}

async function saveQuickCapture() {
  const overlay = document.getElementById('quick-capture-overlay');
  const saveBtn = document.getElementById('quick-capture-save');
  if (!overlay) return;

  // Pull text from whichever mode is active
  const text = (qcMode === 'text'
    ? (document.getElementById('quick-capture-input')?.value || '')
    : qcAccumulated).trim();
  if (text.length < 3) return;

  if (qcRecOn) await qcStopVoice();

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const prompt = overlay.dataset.prompt || QUICK_PROMPTS[0];
  const entry = {
    date: new Date().toISOString(),
    questions: [prompt],
    answers: [text],
    moodBefore: null,
    moodAfter: null,
  };

  const ok = await saveEntry(entry);
  if (!ok) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save thought →';
    alert('Could not save. Please check your connection and try again.');
    return;
  }

  closeQuickCapture();
  showQuickCaptureToast();
  if (document.getElementById('page-home').classList.contains('active')) renderHome();
}

function showQuickCaptureToast() {
  const overlay = document.createElement('div');
  overlay.className = 'quick-capture-toast';
  overlay.innerHTML = `
    <span class="quick-capture-toast-check">✓</span>
    <span>Thought captured</span>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 400);
  }, 2000);
}


function getMoodLogs() {
  if (!currentUser) return [];
  return JSON.parse(localStorage.getItem('gj_mood_logs_' + currentUser.id) || '[]');
}

function saveMoodLog(moodIdx) {
  if (!currentUser) return;
  const logs = getMoodLogs();
  logs.unshift({ mood: moodIdx, date: Date.now() });
  // Keep last 90 days only
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const trimmed = logs.filter(l => l.date > cutoff).slice(0, 365);
  try {
    localStorage.setItem('gj_mood_logs_' + currentUser.id, JSON.stringify(trimmed));
  } catch(e) { /* storage full — silently skip */ }
  renderQuickMood();
}

function quickLogMood(idx) {
  saveMoodLog(idx);
  // Show a quick reaction overlay
  showQuickMoodReaction(idx);
}

function showQuickMoodReaction(idx) {
  const reactions = [
    "Logged. Hard days deserve to be acknowledged. 💙",
    "Logged. Honest tracking is part of the practice.",
    "Logged. Okay is a real and valid place to be.",
    "Logged. Glad you're feeling decent today.",
    "Logged. Beautiful — capture this energy.",
  ];
  const overlay = document.createElement('div');
  overlay.className = 'quick-mood-toast';
  overlay.innerHTML = `
    <div class="quick-mood-toast-emoji">${MOODS[idx].e}</div>
    <div class="quick-mood-toast-text">${reactions[idx]}</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 400);
  }, 2200);
}

function renderQuickMood() {
  const wrap = document.getElementById('quick-mood-wrap');
  if (!wrap) return;

  // Check if user already journaled OR logged mood today
  const todayStr = new Date().toDateString();
  const journaledToday = getEntries().some(e => new Date(e.date).toDateString() === todayStr);
  const logs = getMoodLogs();
  const loggedToday = logs.find(l => new Date(l.date).toDateString() === todayStr);

  // Hide if user already journaled today (full session has mood)
  if (journaledToday) { wrap.innerHTML = ''; return; }

  if (loggedToday) {
    // Show the logged mood with option to update
    const ageMin = Math.floor((Date.now() - loggedToday.date) / 60000);
    let ageLabel;
    if (ageMin < 5) ageLabel = 'just now';
    else if (ageMin < 60) ageLabel = `${ageMin} min ago`;
    else if (ageMin < 1440) ageLabel = `${Math.floor(ageMin / 60)}h ago`;
    else ageLabel = 'earlier';

    wrap.innerHTML = `
      <div class="quick-mood-card quick-mood-logged">
        <div class="quick-mood-eyebrow">Today's check-in · ${ageLabel}</div>
        <div class="quick-mood-logged-row">
          <span class="quick-mood-logged-emoji">${MOODS[loggedToday.mood].e}</span>
          <div>
            <div class="quick-mood-logged-label">${MOODS[loggedToday.mood].label}</div>
            <div class="quick-mood-logged-sub">Tap to update if it's changed</div>
          </div>
        </div>
        <div class="quick-mood-emojis">
          ${MOODS.map((m, i) => `<button class="quick-mood-btn ${i === loggedToday.mood ? 'current' : ''}" onclick="quickLogMood(${i})" title="${m.label}">${m.e}</button>`).join('')}
        </div>
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="quick-mood-card">
        <div class="quick-mood-eyebrow">Quick check-in</div>
        <div class="quick-mood-title">How are you right now?</div>
        <div class="quick-mood-sub">Tap an emoji — no full session needed.</div>
        <div class="quick-mood-emojis">
          ${MOODS.map((m, i) => `<button class="quick-mood-btn" onclick="quickLogMood(${i})" title="${m.label}">${m.e}</button>`).join('')}
        </div>
      </div>`;
  }
}

// ── MOOD LOG CHART ────────────────────────────────
function renderMoodLogChart() {
  const wrap = document.getElementById('mood-log-chart-wrap');
  if (!wrap) return;

  const logs = getMoodLogs();
  // Don't show until we have at least 3 days of data
  if (logs.length < 3) { wrap.innerHTML = ''; return; }

  // Group by day — take LATEST mood per day over the last 14 days
  const dayBuckets = {};
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 13); cutoff.setHours(0,0,0,0);

  logs.forEach(l => {
    const d = new Date(l.date);
    if (d < cutoff) return;
    const key = d.toDateString();
    // Keep most recent log of the day
    if (!dayBuckets[key] || l.date > dayBuckets[key].date) {
      dayBuckets[key] = l;
    }
  });

  // Build array for last N days that have data
  const daysSortedAsc = Object.keys(dayBuckets).sort((a,b) => new Date(a) - new Date(b));
  if (daysSortedAsc.length < 3) { wrap.innerHTML = ''; return; }

  const data = daysSortedAsc.map(dayStr => ({
    day: new Date(dayStr),
    mood: dayBuckets[dayStr].mood, // 0-4
  }));

  // SVG dimensions
  const W = 320;
  const H = 110;
  const PAD_X = 16;
  const PAD_Y = 20;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  // Mood 0 = bottom, 4 = top
  const yFor = (mood) => PAD_Y + innerH - (mood / 4) * innerH;

  // Build smooth line path
  const points = data.map((d, i) => ({
    x: PAD_X + i * stepX,
    y: yFor(d.mood),
    mood: d.mood,
    day: d.day,
  }));

  // Path for line
  let linePath = '';
  points.forEach((p, i) => {
    linePath += (i === 0 ? 'M' : 'L') + ` ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
  });

  // Area path (fill below line)
  const areaPath = linePath + `L ${points[points.length-1].x.toFixed(1)} ${H - PAD_Y} L ${points[0].x.toFixed(1)} ${H - PAD_Y} Z`;

  // Horizontal gridlines at each mood level
  const gridlines = [0,1,2,3,4].map(m => {
    const y = yFor(m);
    return `<line x1="${PAD_X}" y1="${y}" x2="${W - PAD_X}" y2="${y}" stroke="var(--ink-15)" stroke-width="1" stroke-dasharray="2 3" opacity="0.5"/>`;
  }).join('');

  // Calculate trend and insight
  const firstHalf = data.slice(0, Math.ceil(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstAvg = firstHalf.reduce((s, d) => s + d.mood, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, d) => s + d.mood, 0) / secondHalf.length;
  const diff = secondAvg - firstAvg;

  const avgMood = data.reduce((s, d) => s + d.mood, 0) / data.length;
  const latestMood = data[data.length - 1].mood;

  let insight;
  if (diff >= 0.5) {
    insight = { icon: '📈', text: `<strong>Trending up</strong> — your mood has been lifting over these ${data.length} days.` };
  } else if (diff <= -0.5) {
    insight = { icon: '🌊', text: `<strong>A dip lately</strong> — you're not failing, you're noticing. That's the work.` };
  } else if (avgMood >= 3) {
    insight = { icon: '✨', text: `<strong>Steady and good</strong> — you've been in a solid place most days.` };
  } else if (avgMood <= 1) {
    insight = { icon: '💙', text: `<strong>Hard stretch</strong> — be extra gentle with yourself right now.` };
  } else {
    insight = { icon: '🌿', text: `<strong>Even-keeled</strong> — your mood has stayed pretty steady.` };
  }

  const startLabel = data[0].day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = data[data.length - 1].day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  wrap.innerHTML = `
    <div class="mood-log-chart-card">
      <div class="mood-log-chart-head">
        <div class="mood-log-chart-title">Mood log</div>
        <div class="mood-log-chart-range">${startLabel} – ${endLabel}</div>
      </div>
      <div class="mood-log-chart-emojis">
        <span style="font-size:12px;">${MOODS[4].e}</span>
        <span style="font-size:12px;opacity:0.4;">${MOODS[2].e}</span>
        <span style="font-size:12px;opacity:0.4;">${MOODS[0].e}</span>
      </div>
      <div class="mood-log-chart-svg-wrap">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="mood-log-chart-svg">
          <defs>
            <linearGradient id="moodAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--sage)" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="var(--sage)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridlines}
          <path d="${areaPath}" fill="url(#moodAreaGrad)" />
          <path d="${linePath}" fill="none" stroke="var(--sage)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${points.map((p, i) => `
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === points.length - 1 ? 5 : 3.5}" fill="var(--sage)" stroke="var(--white)" stroke-width="2"/>
          `).join('')}
        </svg>
      </div>
      <div class="mood-log-chart-insight">
        <span class="mood-log-chart-insight-icon">${insight.icon}</span>
        <span class="mood-log-chart-insight-text">${insight.text}</span>
      </div>
    </div>`;
}


const DRAFT_EXPIRY_HOURS = 24; // drafts older than this are discarded

function saveDraft() {
  if (!currentUser || !sessionQs.length) return;
  // Only save if there's actual content — avoid saving empty drafts
  const hasContent = qAnswers.some(a => a && a.trim().length > 5);
  if (!hasContent) return;

  const draft = {
    questions: sessionQs,
    answers: qAnswers,
    qIdx: qIdx,
    moodBefore: moodBefore,
    moodAfter: moodAfter,
    inputMode: inputMode,
    chosenEx: chosenEx,
    savedAt: Date.now(),
    reviveDate: reviveDate,
    activeChallenge: window._activeChallenge || null,
  };
  try {
    localStorage.setItem('gj_draft_' + currentUser.id, JSON.stringify(draft));
  } catch(e) {}
}

function getDraft() {
  if (!currentUser) return null;
  try {
    const raw = localStorage.getItem('gj_draft_' + currentUser.id);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    // Check expiry
    const ageHours = (Date.now() - draft.savedAt) / (60 * 60 * 1000);
    if (ageHours > DRAFT_EXPIRY_HOURS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch(e) { return null; }
}

function clearDraft() {
  if (!currentUser) return;
  localStorage.removeItem('gj_draft_' + currentUser.id);
}

function resumeDraft() {
  const draft = getDraft();
  if (!draft) return;
  sessionQs = draft.questions;
  qAnswers = draft.answers;
  qIdx = draft.qIdx || 0;
  moodBefore = draft.moodBefore;
  moodAfter = draft.moodAfter;
  inputMode = draft.inputMode || 'voice';
  chosenEx = draft.chosenEx || null;
  reviveDate = draft.reviveDate || null;
  if (draft.activeChallenge) window._activeChallenge = draft.activeChallenge;
  // Skip directly to the journal screen at the saved question
  goPage('journal');
  renderQ();
}

function dismissDraft() {
  if (!confirm('Discard this draft? Your unsaved answers will be lost.')) return;
  clearDraft();
  renderResumeDraft();
}

function renderResumeDraft() {
  const wrap = document.getElementById('resume-draft-wrap');
  if (!wrap) return;
  const draft = getDraft();
  if (!draft) { wrap.innerHTML = ''; return; }

  // Count filled answers
  const answeredCount = (draft.answers || []).filter(a => a && a.trim().length > 5).length;
  const totalQ = (draft.questions || []).length;
  const ageMin = Math.floor((Date.now() - draft.savedAt) / 60000);
  let ageLabel;
  if (ageMin < 60) ageLabel = `${ageMin} min ago`;
  else if (ageMin < 1440) ageLabel = `${Math.floor(ageMin / 60)}h ago`;
  else ageLabel = 'Yesterday';

  wrap.innerHTML = `
    <div class="resume-draft-card">
      <div class="resume-draft-eyebrow">
        <span>📝 Unfinished session</span>
        <button class="resume-draft-dismiss" onclick="dismissDraft()" title="Discard draft">✕</button>
      </div>
      <div class="resume-draft-title">Pick up where you left off</div>
      <div class="resume-draft-sub">${answeredCount} of ${totalQ} questions answered · ${ageLabel}</div>
      <button class="resume-draft-btn" onclick="resumeDraft()">Resume my session →</button>
    </div>`;
}


function getEntryPhoto(id) {
  if (!currentUser) return null;
  return localStorage.getItem('gj_photo_' + currentUser.id + '_' + id);
}

function setEntryPhoto(id, base64) {
  if (!currentUser) return;
  if (base64 === null) {
    localStorage.removeItem('gj_photo_' + currentUser.id + '_' + id);
  } else {
    try {
      localStorage.setItem('gj_photo_' + currentUser.id + '_' + id, base64);
    } catch(e) {
      alert('Storage full — could not save photo. Try a smaller image.');
    }
  }
}

function openPhotoPicker(entryId) {
  const existing = document.getElementById('photo-input-temp');
  if (existing) existing.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'photo-input-temp';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.onchange = (e) => handlePhotoSelect(e, entryId);
  document.body.appendChild(input);
  input.click();
}

function handlePhotoSelect(event, entryId) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_DIM = 1200;
      let w = img.width, h = img.height;
      if (w > h && w > MAX_DIM) { h = h * (MAX_DIM / w); w = MAX_DIM; }
      else if (h > MAX_DIM) { w = w * (MAX_DIM / h); h = MAX_DIM; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.75);
      setEntryPhoto(entryId, compressed);
      const inp = document.getElementById('photo-input-temp');
      if (inp) inp.remove();
      renderHistory();
      const photoEl = document.getElementById('summary-photo-section');
      if (photoEl) photoEl.outerHTML = renderPhotoSection(entryId, true);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeEntryPhoto(entryId) {
  if (!confirm('Remove this photo?')) return;
  setEntryPhoto(entryId, null);
  renderHistory();
  const photoEl = document.getElementById('summary-photo-section');
  if (photoEl) photoEl.outerHTML = renderPhotoSection(entryId, true);
}

function renderPhotoSection(entryId, isSummary) {
  const photo = getEntryPhoto(entryId);
  if (photo) {
    return `<div class="entry-photo-wrap"${isSummary ? ' id="summary-photo-section"' : ''}>
      <img src="${photo}" class="entry-photo" onclick="viewPhotoFullscreen('${entryId}')" alt="Entry photo"/>
      <button class="entry-photo-remove" onclick="removeEntryPhoto('${entryId}')" title="Remove photo">✕</button>
    </div>`;
  }
  return `<button class="entry-photo-add"${isSummary ? ' id="summary-photo-section"' : ''} onclick="openPhotoPicker('${entryId}')">
    <span class="entry-photo-add-icon">📷</span>
    <span>Add a photo</span>
  </button>`;
}

function viewPhotoFullscreen(entryId) {
  const photo = getEntryPhoto(entryId);
  if (!photo) return;
  const overlay = document.createElement('div');
  overlay.id = 'photo-fullscreen-overlay';
  overlay.className = 'photo-fullscreen-overlay';
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `
    <img src="${photo}" class="photo-fullscreen-img" alt="Entry photo"/>
    <button class="photo-fullscreen-close">✕</button>
  `;
  document.body.appendChild(overlay);
}


const ENTRY_TAGS = {
  rose:     { color: '#E89B9B', label: 'Rose',     desc: 'Love & connection' },
  amber:    { color: '#E8B05A', label: 'Amber',    desc: 'Joy & gratitude' },
  gold:     { color: '#D4B95C', label: 'Gold',     desc: 'Achievement' },
  sage:     { color: '#7BBDA4', label: 'Sage',     desc: 'Peaceful & calm' },
  ocean:    { color: '#5BA8C4', label: 'Ocean',    desc: 'Reflection' },
  lavender: { color: '#A89BD9', label: 'Lavender', desc: 'Spiritual' },
  berry:    { color: '#C56B8A', label: 'Berry',    desc: 'Challenging' },
};

function getEntryTag(id) {
  if (!currentUser) return null;
  const tags = JSON.parse(localStorage.getItem('gj_tags_' + currentUser.id) || '{}');
  return tags[id] || null;
}

function setEntryTag(id, color) {
  if (!currentUser) return;
  const key = 'gj_tags_' + currentUser.id;
  const tags = JSON.parse(localStorage.getItem(key) || '{}');
  if (color === null) delete tags[id];
  else tags[id] = color;
  localStorage.setItem(key, JSON.stringify(tags));
}

function openTagPicker(entryId) {
  const current = getEntryTag(entryId);
  const modal = document.createElement('div');
  modal.id = 'tag-picker-modal';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:340px;">
      <div class="modal-title">Tag this entry</div>
      <div class="modal-sub">Color-code your reflection to find it later.</div>
      <div class="tag-grid">
        <button class="tag-option ${!current ? 'active' : ''}" onclick="applyTag('${entryId}', null)">
          <span class="tag-dot" style="background:transparent;border:2px dashed var(--ink-30);"></span>
          <span class="tag-label">None</span>
        </button>
        ${Object.entries(ENTRY_TAGS).map(([key, t]) => `
          <button class="tag-option ${current === key ? 'active' : ''}" onclick="applyTag('${entryId}', '${key}')">
            <span class="tag-dot" style="background:${t.color};"></span>
            <span class="tag-label">${t.label}</span>
            <span class="tag-desc">${t.desc}</span>
          </button>
        `).join('')}
      </div>
      <button class="btn" style="width:100%;margin-top:1rem;" onclick="closeTagPicker()">Close</button>
    </div>`;
  document.body.appendChild(modal);
}

function closeTagPicker() {
  const m = document.getElementById('tag-picker-modal');
  if (m) m.remove();
}

function applyTag(entryId, color) {
  setEntryTag(entryId, color);
  closeTagPicker();
  renderTagFilterRow();
  renderHistory();
}

function renderHistory() {
  // If calendar view active, render that instead
  if (histView === 'calendar') { renderCalendar(); return; }
  const allEntries = getEntries();
  const el = document.getElementById('hist-list');
  const ce = document.getElementById('hist-count');
  if (ce) ce.textContent = allEntries.length ? `${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}` : '';

  if (!allEntries.length) {
    el.innerHTML = `<div class="empty-state-rich">
      <div class="empty-rich-icon">📖</div>
      <div class="empty-rich-title">Your story starts here</div>
      <div class="empty-rich-sub">Every entry you write becomes part of a record only you can see — searchable, sortable, and yours forever.</div>
      <div class="empty-rich-features">
        <div class="empty-rich-feat"><span>🔍</span><span>Search every entry</span></div>
        <div class="empty-rich-feat"><span>📅</span><span>Calendar view</span></div>
        <div class="empty-rich-feat"><span>🏷️</span><span>Color tags</span></div>
      </div>
      <button class="empty-rich-cta" onclick="beginSession()">Write your first entry →</button>
      <div class="empty-rich-trust">Your words are encrypted and private to you</div>
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

    const tagColor = getEntryTag(e.id);
    const tagBar = tagColor ? `<div class="hist-entry-tag-bar" style="background:${ENTRY_TAGS[tagColor].color};"></div>` : '';
    const photoSection = !isEditing ? renderPhotoSection(e.id, false) : '';

    return `<div class="hist-entry">
      ${tagBar}
      <div class="hist-entry-head">
        <div>
          <div class="hist-date">${new Date(e.date).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</div>
          ${moodRow}
        </div>
        <div class="hist-actions">
          ${isEditing
            ? `<button class="hist-edit-btn" onclick="saveEdit('${e.id}')" style="color:var(--sage);border-color:var(--sage-mid);">Save</button><button class="hist-edit-btn" onclick="cancelEdit()">Cancel</button>`
            : `<button class="hist-edit-btn" onclick="openTagPicker('${e.id}')">${tagColor ? '🏷️' : '○'} Tag</button><button class="hist-edit-btn" onclick="startEdit('${e.id}')">Edit</button><button class="hist-del" onclick="askDelete('${e.id}')">Delete</button>`
          }
        </div>
      </div>
      ${photoSection}
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
  const ds = document.getElementById('data-summary'); if (ds) { const n = getEntries().length; ds.textContent = `${n} journal entr${n === 1 ? 'y' : 'ies'} synced to cloud.`; }
  const nt = document.getElementById('settings-notif-time'); if (nt) nt.value = localStorage.getItem('gj_notif_time') || '20:00';
  const ns = document.getElementById('notif-status'); if (ns) ns.textContent = localStorage.getItem('gj_notif_enabled') ? '✓ Reminders enabled' : '';

  // Goal display
  const goalEl = document.getElementById('settings-goal-display');
  if (goalEl) {
    const goal = localStorage.getItem('gj_goal');
    const goalLabels = {
      stress: { icon: '😮‍💨', label: 'Reduce stress & anxiety' },
      gratitude: { icon: '🙏', label: 'Build a gratitude practice' },
      clarity: { icon: '🔮', label: 'Gain clarity & focus' },
      growth: { icon: '🌱', label: 'Personal growth & reflection' },
    };
    const g = goal && goalLabels[goal];
    goalEl.innerHTML = g
      ? `<span class="settings-goal-icon">${g.icon}</span><span class="settings-goal-label">${g.label}</span>`
      : '<span style="color:var(--ink-60);font-size:13px;">No goal set</span>';
  }

  // Saved affirmations count
  const affCount = document.getElementById('saved-aff-count');
  if (affCount) {
    const favs = getFavAffirmations();
    affCount.textContent = favs.length ? `(${favs.length})` : '';
  }

  // Achievements count
  const achPill = document.getElementById('ach-progress-pill');
  if (achPill) {
    const all = calculateAchievements();
    const unlocked = all.filter(a => a.unlocked).length;
    achPill.textContent = `(${unlocked}/${all.length})`;
  }

  // Shake to capture status
  renderShakeStatus();

  // Apple Health status (only shows on iOS)
  renderHealthStatus();
}

async function renderHealthStatus() {
  const block = document.getElementById('health-block');
  const label = document.getElementById('health-status-label');
  const btn = document.getElementById('health-toggle-btn');
  if (!block || !label || !btn) return;

  // Only show this section on iOS
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    block.style.display = 'none';
    return;
  }

  // Check if plugin is available
  const Health = getHealthPlugin();
  if (!Health) {
    // Plugin not installed yet — hide section
    block.style.display = 'none';
    return;
  }

  block.style.display = '';
  const authed = await isHealthAuthorized();
  if (authed) {
    label.innerHTML = '<span style="color:var(--sage);">✓ Connected — logging mindful minutes</span>';
    btn.textContent = 'Disconnect';
  } else {
    label.innerHTML = '<span style="color:var(--ink-60);">Not connected</span>';
    btn.textContent = 'Connect';
  }
}

async function toggleHealthFromSettings() {
  const btn = document.getElementById('health-toggle-btn');
  const authed = await isHealthAuthorized();
  if (authed) {
    await disconnectHealth();
    alert('Disconnected. To fully revoke access, also visit iPhone Settings → Health → Sources → Gratitude.');
  } else {
    if (btn) { btn.disabled = true; btn.textContent = 'Requesting…'; }
    const result = await requestHealthPermission();
    if (btn) btn.disabled = false;
    if (!result.ok) {
      if (result.reason === 'unavailable') {
        alert('Apple Health is not available on this device.');
      } else {
        alert('Permission was not granted. You can enable it in iPhone Settings → Health → Sources → Gratitude.');
      }
    }
  }
  renderHealthStatus();
}

function renderShakeStatus() {
  const label = document.getElementById('shake-status-label');
  const btn = document.getElementById('shake-toggle-btn');
  if (!label || !btn) return;

  const disabled = localStorage.getItem('gj_shake_disabled') === '1';
  if (disabled) {
    label.innerHTML = '<span style="color:var(--ink-60);">Shake gesture <strong>off</strong></span>';
    btn.textContent = 'Enable';
  } else if (shakeInitialized) {
    label.innerHTML = '<span style="color:var(--sage);">✓ Shake gesture <strong>on</strong></span>';
    btn.textContent = 'Disable';
  } else {
    label.innerHTML = '<span style="color:var(--ink-60);">Shake permission needed</span>';
    btn.textContent = 'Enable';
  }
}

async function toggleShakeFromSettings() {
  const disabled = localStorage.getItem('gj_shake_disabled') === '1';
  if (disabled || !shakeInitialized) {
    const granted = await askShakePermission();
    if (!granted) {
      alert('Shake gesture requires motion sensor permission. Enable in iPhone Settings → Gratitude → Motion & Fitness.');
    }
  } else {
    disableShake();
  }
  renderShakeStatus();
}

// ── ACHIEVEMENTS ──────────────────────────────────
function calculateAchievements() {
  const entries = getEntries();
  const totalEntries = entries.length;
  const currentStreak = streak();
  const favs = getFavAffirmations();

  // Best ever streak
  const sorted = [...entries].sort((a,b) => new Date(a.date) - new Date(b.date));
  let bestStreak = 0, currentRun = 1, prev = null;
  for (const e of sorted) {
    const day = new Date(e.date); day.setHours(0,0,0,0);
    if (prev) {
      const diff = (day - prev) / (24*60*60*1000);
      if (diff === 0) continue;
      if (diff === 1) currentRun++;
      else { bestStreak = Math.max(bestStreak, currentRun); currentRun = 1; }
    }
    prev = day;
  }
  bestStreak = Math.max(bestStreak, currentRun);

  // Challenge completions (using existing storage)
  let challengesCompleted = 0;
  if (currentUser) {
    const ch = JSON.parse(localStorage.getItem('gj_challenge_' + currentUser.id) || '{}');
    challengesCompleted = ch.completed || 0;
  }

  // Photos attached
  let photoCount = 0;
  if (currentUser) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gj_photo_' + currentUser.id + '_')) photoCount++;
    }
  }

  // Tagged entries
  let taggedCount = 0;
  if (currentUser) {
    const tags = JSON.parse(localStorage.getItem('gj_tags_' + currentUser.id) || '{}');
    taggedCount = Object.keys(tags).length;
  }

  // Build all achievement definitions
  const all = [];

  // Streak milestones
  STREAK_MILESTONES.forEach(m => {
    all.push({
      group: 'Streak',
      icon: m.icon,
      title: `${m.days}-day streak`,
      sub: m.subtitle,
      unlocked: bestStreak >= m.days,
      progress: Math.min(bestStreak, m.days),
      target: m.days,
      gradient: m.gradient,
    });
  });

  // Total entries milestones
  MILESTONES.forEach(m => {
    all.push({
      group: 'Entries',
      icon: m.icon,
      title: m.title,
      sub: m.count === 1 ? 'Your first reflection' : `Reach ${m.count} total entries`,
      unlocked: totalEntries >= m.count,
      progress: Math.min(totalEntries, m.count),
      target: m.count,
      gradient: 'linear-gradient(135deg,#7BBDA4,#2D7A5F)',
    });
  });

  // Other achievements
  const others = [
    { icon: '📷', title: 'Memory Keeper',     sub: 'Attach your first photo to an entry',  unlocked: photoCount >= 1,  progress: Math.min(photoCount, 1),  target: 1 },
    { icon: '📸', title: 'Photographer',      sub: 'Attach 10 photos to your entries',     unlocked: photoCount >= 10, progress: Math.min(photoCount, 10), target: 10 },
    { icon: '🏷️', title: 'Organized',         sub: 'Tag 5 entries to organize them',       unlocked: taggedCount >= 5, progress: Math.min(taggedCount, 5), target: 5 },
    { icon: '✨', title: 'Word Collector',     sub: 'Save 10 favorite affirmations',        unlocked: favs.length >= 10, progress: Math.min(favs.length, 10), target: 10 },
    { icon: '🎯', title: 'First Challenge',   sub: 'Complete one day of a 7-day challenge',unlocked: challengesCompleted >= 1, progress: Math.min(challengesCompleted, 1), target: 1 },
    { icon: '🏅', title: 'Challenge Champion',sub: 'Complete a full 7-day challenge',      unlocked: challengesCompleted >= 7, progress: Math.min(challengesCompleted, 7), target: 7 },
  ];
  others.forEach(o => all.push({ ...o, group: 'Special', gradient: 'linear-gradient(135deg,#5B4A8A,#3a2f5e)' }));

  return all;
}

function openAchievements() {
  const all = calculateAchievements();
  const unlockedCount = all.filter(a => a.unlocked).length;
  const totalCount = all.length;

  // Group by category
  const groups = { Streak: [], Entries: [], Special: [] };
  all.forEach(a => groups[a.group].push(a));

  const overlay = document.createElement('div');
  overlay.id = 'achievements-overlay';
  overlay.className = 'achievements-overlay';

  const groupHtml = (groupName, items) => `
    <div class="ach-group-title">${groupName}</div>
    <div class="ach-grid">
      ${items.map(a => {
        const pct = (a.progress / a.target) * 100;
        return `
          <div class="ach-card ${a.unlocked ? 'unlocked' : 'locked'}" ${a.unlocked ? `style="background:${a.gradient};"` : ''}>
            <div class="ach-icon">${a.unlocked ? a.icon : '🔒'}</div>
            <div class="ach-title">${esc(a.title)}</div>
            <div class="ach-sub">${esc(a.sub)}</div>
            ${!a.unlocked ? `
              <div class="ach-progress-bar">
                <div class="ach-progress-fill" style="width:${pct}%;"></div>
              </div>
              <div class="ach-progress-text">${a.progress} / ${a.target}</div>
            ` : '<div class="ach-unlocked-badge">✓ Earned</div>'}
          </div>`;
      }).join('')}
    </div>`;

  overlay.innerHTML = `
    <div class="achievements-modal">
      <div class="achievements-header">
        <div class="achievements-title-block">
          <div class="achievements-eyebrow">🏆 Achievements</div>
          <div class="achievements-title">${unlockedCount} of ${totalCount} earned</div>
          <div class="achievements-progress-bar"><div class="achievements-progress-fill" style="width:${(unlockedCount/totalCount)*100}%;"></div></div>
        </div>
        <button class="achievements-close" onclick="closeAchievements()">✕</button>
      </div>
      ${groupHtml('Streak Milestones', groups.Streak)}
      ${groupHtml('Total Entries', groups.Entries)}
      ${groupHtml('Special', groups.Special)}
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function closeAchievements() {
  const o = document.getElementById('achievements-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
}


function calculateYearReview(year) {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

  const allEntries = getEntries();
  const yearEntries = allEntries.filter(e => {
    const d = new Date(e.date);
    return d >= yearStart && d <= yearEnd;
  });

  if (yearEntries.length === 0) return null;

  // Total stats
  let totalWords = 0;
  yearEntries.forEach(e => {
    (e.answers || []).forEach(a => {
      if (a) totalWords += a.trim().split(/\s+/).filter(Boolean).length;
    });
  });
  const totalMinutes = Math.max(yearEntries.length * 3, Math.round(totalWords / 80));
  const totalHours = +(totalMinutes / 60).toFixed(1);

  // Best streak this year
  const sorted = [...yearEntries].sort((a,b) => new Date(a.date) - new Date(b.date));
  let bestStreak = 0, currentRun = 1, prev = null;
  for (const e of sorted) {
    const day = new Date(e.date); day.setHours(0,0,0,0);
    if (prev) {
      const diff = (day - prev) / (24*60*60*1000);
      if (diff === 0) continue;
      if (diff === 1) currentRun++;
      else { bestStreak = Math.max(bestStreak, currentRun); currentRun = 1; }
    }
    prev = day;
  }
  bestStreak = Math.max(bestStreak, currentRun);

  // Mood shift average
  const withBoth = yearEntries.filter(e => e.mood_before != null && e.mood_after != null);
  const avgLift = withBoth.length
    ? +(withBoth.reduce((s,e) => s + (e.mood_after - e.mood_before), 0) / withBoth.length).toFixed(1)
    : null;

  // Days journaled
  const uniqueDays = new Set(yearEntries.map(e => new Date(e.date).toDateString())).size;

  // Most active month
  const monthCounts = new Array(12).fill(0);
  yearEntries.forEach(e => monthCounts[new Date(e.date).getMonth()]++);
  const bestMonthIdx = monthCounts.indexOf(Math.max(...monthCounts));
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const bestMonth = { name: monthNames[bestMonthIdx], count: monthCounts[bestMonthIdx] };

  // Top words (excluding stop words)
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','my','i','me','was','is','are','were','have','had','has','that','this','it','be','been','not','so','if','as','do','did','what','how','just','like','very','from','about','when','who','which','can','will','would','could','should','than','then','there','their','they','we','our','your','you','he','she','his','her','him','its','all','one','out','up','by','more','also','am','into','get','got','no','any','really','feel','feeling','felt','today','day','today','time','things','thing']);
  const wordCount = {};
  yearEntries.forEach(e => {
    (e.answers || []).forEach(a => {
      if (!a) return;
      a.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
        if (w.length > 3 && !stopWords.has(w)) wordCount[w] = (wordCount[w] || 0) + 1;
      });
    });
  });
  const topWords = Object.entries(wordCount).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);

  // Best entry — longest meaningful answer
  let highlightEntry = null;
  let highlightAnswer = '';
  yearEntries.forEach(e => {
    (e.answers || []).forEach(a => {
      if (a && a.length > highlightAnswer.length) {
        highlightAnswer = a;
        highlightEntry = e;
      }
    });
  });

  return {
    year: targetYear,
    totalEntries: yearEntries.length,
    totalWords,
    totalMinutes,
    totalHours,
    bestStreak,
    avgLift,
    uniqueDays,
    bestMonth,
    topWords,
    highlightEntry,
    highlightAnswer,
  };
}

let yearReviewSlide = 0;
let yearReviewData = null;
const YEAR_REVIEW_TOTAL_SLIDES = 7;

function openYearReview() {
  const review = calculateYearReview();
  if (!review) {
    alert('Complete a few journal entries first to see your year in review.');
    return;
  }
  yearReviewData = review;
  yearReviewSlide = 0;
  showYearReviewSlide();
}

function closeYearReview() {
  const o = document.getElementById('year-review-overlay');
  if (o) o.remove();
  document.body.style.overflow = '';
  yearReviewSlide = 0;
  yearReviewData = null;
}

function nextYearSlide() {
  yearReviewSlide++;
  if (yearReviewSlide >= YEAR_REVIEW_TOTAL_SLIDES) {
    closeYearReview();
    return;
  }
  showYearReviewSlide();
}

function prevYearSlide() {
  if (yearReviewSlide > 0) {
    yearReviewSlide--;
    showYearReviewSlide();
  }
}

function showYearReviewSlide() {
  const r = yearReviewData;
  if (!r) return;

  // Different gradient bg per slide
  const slideThemes = [
    { bg: 'linear-gradient(135deg,#2D7A5F,#1f5a45)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#5B4A8A,#3a2f5e)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#C97B3D,#9c5b29)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#1E6A8A,#114866)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#8A3030,#5e1f1f)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#9A6520,#6e4615)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#2D7A5F,#7BBDA4)', text: '#fff' },
  ];

  const slides = [
    // Slide 0: Welcome
    {
      content: `
        <div class="yr-welcome-icon">✨</div>
        <div class="yr-welcome-eyebrow">Your Year in Gratitude</div>
        <div class="yr-welcome-year">${r.year}</div>
        <div class="yr-welcome-sub">A look back at your journey through reflection.</div>
        <div class="yr-tap-hint">Tap to begin →</div>
      `
    },
    // Slide 1: Total entries
    {
      content: `
        <div class="yr-stat-eyebrow">You journaled</div>
        <div class="yr-stat-big">${r.totalEntries}</div>
        <div class="yr-stat-label">${r.totalEntries === 1 ? 'entry' : 'entries'} this year</div>
        <div class="yr-stat-context">across <strong>${r.uniqueDays}</strong> different days</div>
      `
    },
    // Slide 2: Time spent
    {
      content: `
        <div class="yr-stat-eyebrow">You spent</div>
        <div class="yr-stat-big">${r.totalHours}</div>
        <div class="yr-stat-label">${r.totalHours === 1 ? 'hour' : 'hours'} on yourself</div>
        <div class="yr-stat-context">that's a real gift to your future self</div>
      `
    },
    // Slide 3: Words written
    {
      content: `
        <div class="yr-stat-eyebrow">You wrote</div>
        <div class="yr-stat-big">${r.totalWords.toLocaleString()}</div>
        <div class="yr-stat-label">words of reflection</div>
        <div class="yr-stat-context">enough to fill a small book</div>
      `
    },
    // Slide 4: Best streak
    {
      content: `
        <div class="yr-stat-eyebrow">Your best streak</div>
        <div class="yr-stat-big">${r.bestStreak}</div>
        <div class="yr-stat-label">${r.bestStreak === 1 ? 'day' : 'days in a row'}</div>
        <div class="yr-stat-context">${r.bestStreak >= 30 ? 'a true devoted practice' : r.bestStreak >= 7 ? 'most people never make it this far' : 'every day counts — keep building'}</div>
      `
    },
    // Slide 5: Top words
    {
      content: `
        <div class="yr-stat-eyebrow">Your year in words</div>
        <div class="yr-words-cloud">
          ${r.topWords.map((w, i) => `
            <span class="yr-word" style="animation-delay:${i * 0.1}s;font-size:${22 - i * 1.5}px;">${esc(w)}</span>
          `).join('')}
        </div>
        <div class="yr-stat-context" style="margin-top:1.5rem;">the themes you returned to most</div>
      `
    },
    // Slide 6: Closing
    {
      content: `
        <div class="yr-welcome-icon">🌱</div>
        <div class="yr-welcome-eyebrow">Thank you for showing up</div>
        <div class="yr-closing-text">Every entry was a moment you chose <strong>yourself</strong>.</div>
        <div class="yr-closing-text" style="margin-top:1rem;">Here's to ${r.year + 1}.</div>
        <button class="yr-cta-btn" onclick="closeYearReview()">Continue your journey →</button>
      `
    },
  ];

  const theme = slideThemes[yearReviewSlide];
  const slide = slides[yearReviewSlide];

  // Progress dots
  const dotsHtml = Array.from({length: YEAR_REVIEW_TOTAL_SLIDES}, (_, i) =>
    `<div class="yr-progress-dot ${i <= yearReviewSlide ? 'filled' : ''}"></div>`
  ).join('');

  let overlay = document.getElementById('year-review-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'year-review-overlay';
    overlay.className = 'yr-overlay';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  overlay.innerHTML = `
    <div class="yr-slide" style="background:${theme.bg};color:${theme.text};">
      <button class="yr-close" onclick="closeYearReview()">✕</button>
      <div class="yr-progress-row">${dotsHtml}</div>
      <div class="yr-content">
        ${slide.content}
      </div>
      ${yearReviewSlide < YEAR_REVIEW_TOTAL_SLIDES - 1 ? `
        <div class="yr-nav-areas">
          <div class="yr-nav-area-left" onclick="prevYearSlide()"></div>
          <div class="yr-nav-area-right" onclick="nextYearSlide()"></div>
        </div>
      ` : ''}
    </div>`;
}


function openGoalChanger() {
  const current = localStorage.getItem('gj_goal');
  const goals = [
    { id: 'stress', icon: '😮‍💨', label: 'Reduce stress & anxiety' },
    { id: 'gratitude', icon: '🙏', label: 'Build a gratitude practice' },
    { id: 'clarity', icon: '🔮', label: 'Gain clarity & focus' },
    { id: 'growth', icon: '🌱', label: 'Personal growth & reflection' },
  ];
  const overlay = document.createElement('div');
  overlay.id = 'goal-changer-overlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:380px;">
      <div class="modal-title">Change your goal</div>
      <div class="modal-sub">Your goal personalizes the entire app — questions, affirmations, learn content, and daily messages.</div>
      <div class="goal-changer-list">
        ${goals.map(g => `
          <button class="goal-change-btn ${current === g.id ? 'active' : ''}" onclick="applyNewGoal('${g.id}')">
            <span class="goal-change-icon">${g.icon}</span>
            <span class="goal-change-label">${g.label}</span>
            ${current === g.id ? '<span class="goal-change-current">Current</span>' : ''}
          </button>
        `).join('')}
      </div>
      <button class="btn" style="width:100%;margin-top:1rem;" onclick="closeGoalChanger()">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);
}

function closeGoalChanger() {
  const o = document.getElementById('goal-changer-overlay');
  if (o) o.remove();
}

function applyNewGoal(goal) {
  localStorage.setItem('gj_goal', goal);
  closeGoalChanger();
  renderSettings();
  alert('✓ Goal updated. Your next session will use new questions tailored to this goal.');
}

// Saved affirmations viewer
function openSavedAffirmations() {
  const favs = getFavAffirmations();
  const overlay = document.createElement('div');
  overlay.id = 'saved-aff-overlay';
  overlay.className = 'modal-overlay open';
  const itemsHtml = favs.length
    ? favs.map((f, i) => {
        const text = typeof f === 'string' ? f : f.text;
        return `
          <div class="saved-aff-item">
            <div class="saved-aff-text">"${esc(text)}"</div>
            <button class="saved-aff-remove" onclick="removeSavedAffByIndex(${i})">Remove</button>
          </div>`;
      }).join('')
    : '<div style="text-align:center;padding:2rem 1rem;color:var(--ink-60);font-size:14px;line-height:1.6;">No saved affirmations yet.<br>Tap ♡ Save on a daily affirmation to keep it here.</div>';
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:440px;max-height:80vh;overflow-y:auto;">
      <div class="modal-title">Saved affirmations</div>
      <div class="modal-sub">Affirmations you've saved from your daily practice.</div>
      <div class="saved-aff-list">${itemsHtml}</div>
      <button class="btn" style="width:100%;margin-top:1rem;" onclick="closeSavedAffirmations()">Close</button>
    </div>`;
  document.body.appendChild(overlay);
}

function removeSavedAffByIndex(idx) {
  if (!currentUser) return;
  const key = 'gj_fav_affirmations_' + currentUser.id;
  const favs = JSON.parse(localStorage.getItem(key) || '[]');
  const cleaned = favs.map(f => typeof f === 'string' ? f : f.text);
  cleaned.splice(idx, 1);
  localStorage.setItem(key, JSON.stringify(cleaned));
  closeSavedAffirmations();
  openSavedAffirmations();
  renderSettings();
}

function closeSavedAffirmations() {
  const o = document.getElementById('saved-aff-overlay');
  if (o) o.remove();
}

// Export entries
function exportEntries() {
  const es = getEntries();
  if (es.length === 0) {
    alert('No entries to export yet.');
    return;
  }

  // Build a beautifully formatted text export
  const sortedEntries = [...es].sort((a,b) => new Date(b.date) - new Date(a.date));
  const lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push('  GRATITUDE JOURNAL EXPORT');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push(`Total entries: ${es.length}`);
  lines.push('');
  lines.push('═══════════════════════════════════════');
  lines.push('');

  sortedEntries.forEach(entry => {
    const date = new Date(entry.date).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    const time = new Date(entry.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    lines.push(`📅 ${date} · ${time}`);
    lines.push('───────────────────────────────────────');
    if (entry.mood_before != null || entry.mood_after != null) {
      const before = entry.mood_before != null ? MOODS[entry.mood_before].label : '?';
      const after  = entry.mood_after  != null ? MOODS[entry.mood_after].label : '?';
      lines.push(`Mood: ${before} → ${after}`);
      lines.push('');
    }
    (entry.questions || []).forEach((q, i) => {
      const a = (entry.answers || [])[i] || '(skipped)';
      lines.push(`Q: ${q}`);
      lines.push(`A: ${a}`);
      lines.push('');
    });
    lines.push('');
  });

  const text = lines.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const filename = `gratitude-journal-${new Date().toISOString().split('T')[0]}.txt`;

  // For iOS Capacitor, open in new tab
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    // Try Web Share API first if available
    if (navigator.share) {
      const file = new File([blob], filename, { type: 'text/plain' });
      navigator.share({ files: [file], title: 'Gratitude Journal Export' }).catch(() => {
        // Fallback to download
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
      });
    } else {
      window.open(url, '_blank');
    }
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  { id: 'l21', cat: 'Mindfulness', icon: '🎯', bg: '#F0EDF7', color: '#5B4A8A', title: 'Single-Tasking', time: '25 min',
    desc: 'Multitasking is a myth — it reduces performance by 40%. Single-tasking is a trainable skill that rebuilds focus.',
    steps: ['Choose one task. Write it on a piece of paper and place it where you can see it.','Close every tab, app, and window not related to that task. Put your phone face-down.','Set a timer for 25 minutes. This is your only job until the timer goes off.','When your mind wanders — and it will — gently return to the task without judgment.','If a thought or to-do arrives, write it on a separate list and return to the task.','When the timer ends, take a 5-minute break before starting again.','Track how many 25-minute blocks you complete in a day. This number will grow.'],
    tip: '<strong>The Pomodoro Technique:</strong> This method was developed by Francesco Cirillo in the late 1980s. The name comes from a tomato-shaped kitchen timer. The technique works because it makes time visible and finite.' },

  { id: 'l22', cat: 'Journaling', icon: '📝', bg: '#E8F4F8', color: '#1E6A8A', title: 'Unsent Letter', time: '15 min',
    desc: 'Write a letter you will never send. One of the most powerful emotional processing tools in therapy.',
    steps: ['Choose a person, situation, or even a version of yourself you need to address.','Begin with "Dear ___." Give yourself full permission to say everything you have held back.','Write without editing, without being fair, without worrying about their perspective.','Say what you needed them to understand. What you needed them to do. What their actions cost you.','If it turns to forgiveness, let it. If it stays in anger, that is also fine. Follow where it leads.','When you feel complete — not when you run out of words, but when you feel the release — stop.','You do not need to keep it. You can burn it, shred it, or delete it. The act of writing was the point.'],
    tip: '<strong>Used in therapy for:</strong> grief, anger, unresolved relationships, past trauma, and difficult conversations you cannot have in real life. The research on expressive writing is extensive and consistent.' },

  { id: 'l23', cat: 'Sleep', icon: '🌡️', bg: '#FDF3E3', color: '#9A6520', title: 'Temperature Regulation for Sleep', time: '30 min',
    desc: 'Your core body temperature must drop 1-3 degrees to initiate sleep. Most people fight this process without knowing.',
    steps: ['Set your bedroom temperature between 65-68°F (18-20°C). This is colder than most people keep their rooms.','Take a warm shower or bath 1-2 hours before bed. This sounds counterintuitive but works by pulling heat to your skin surface, then rapidly cooling your core when you step out.','Keep your feet warm — cold feet constrict blood vessels and prevent the heat-dumping your body needs. Wear socks if needed.','Use layered bedding you can kick off rather than a single heavy blanket.','Avoid exercise within 2 hours of bed — it raises core temperature significantly.','If you wake up hot in the night, expose one foot outside the covers. Your foot is a radiator.'],
    tip: "<strong>Why this works:</strong> The body clock (circadian rhythm) and sleep onset are directly linked to core temperature drop. Matthew Walker's research shows temperature is one of the most underrated sleep levers." },

  { id: 'l24', cat: 'Breathing', icon: '🌬️', bg: '#EDF5F1', color: '#2D7A5F', title: 'Alternate Nostril Breathing', time: '5 min',
    desc: 'A yogic pranayama technique shown to balance the nervous system and reduce blood pressure within minutes.',
    steps: ['Sit comfortably with a straight spine. Rest your left hand on your left knee.','Bring your right hand to your face. Place your right thumb on your right nostril and your ring finger on your left nostril.','Close your right nostril with your thumb. Inhale slowly through your left nostril for 4 counts.','Close both nostrils. Hold for 2 counts.','Release your thumb. Exhale through your right nostril for 4 counts.','Inhale through the right nostril for 4 counts.','Close both. Hold 2 counts. Then exhale through the left nostril.','This completes one cycle. Repeat 5–10 cycles.'],
    tip: '<strong>The research:</strong> A 2013 study found alternate nostril breathing significantly reduced heart rate and blood pressure. Left nostril breathing activates the right hemisphere; right nostril activates the left.' },

  { id: 'l25', cat: 'Mindfulness', icon: '🌊', bg: '#F0EDF7', color: '#5B4A8A', title: 'RAIN Technique', time: '10 min',
    desc: 'A mindfulness practice from Tara Brach for working with difficult emotions. Recognize, Allow, Investigate, Nurture.',
    steps: ['R — RECOGNIZE: Pause and name what you are feeling. "There is fear here." "There is shame here." Naming it activates the prefrontal cortex and reduces the amygdala response.','A — ALLOW: Let the feeling be there without trying to fix, avoid, or suppress it. Say inwardly "yes" to its presence, even if it is uncomfortable.','I — INVESTIGATE: With gentle curiosity, ask: Where do I feel this in my body? What does it believe? What does it need?','N — NURTURE: Offer yourself what the feeling needs. A hand on your heart. Words like "this is hard" or "I am here." The compassion you would offer a dear friend.','After RAIN, rest in the open awareness that remains. Notice who is noticing.'],
    tip: '<strong>Created by:</strong> Tara Brach, mindfulness teacher and clinical psychologist. RAIN is especially powerful for shame, fear, and self-criticism. It transforms the relationship to difficulty rather than eliminating it.' },

  { id: 'l26', cat: 'Journaling', icon: '🔮', bg: '#E8F4F8', color: '#1E6A8A', title: 'Future Self Letter', time: '20 min',
    desc: 'Write a letter from your future self to your present self. Activates identity-level change.',
    steps: ['Choose a specific future date — one year, five years, or ten years from today.','Write as if you are that future version of yourself, writing back to who you are right now.','Describe what your life looks like. What you are proud of. What you figured out.','Tell your present self what you needed to hear, what fears were unfounded, what was worth the effort.','Be specific — vague letters have less impact. Name real things, real decisions, real feelings.','Tell your present self what to stop doing. What to start. What to hold onto.','Seal it digitally or physically. Set a calendar reminder to open it on that future date.'],
    tip: "<strong>The psychology:</strong> Research by Hal Hershfield shows that people who feel connected to their future selves make better long-term decisions. This letter builds that connection." },

  { id: 'l27', cat: 'Sleep', icon: '📵', bg: '#FDF3E3', color: '#9A6520', title: 'Digital Sunset', time: '60 min',
    desc: 'A structured screen-free hour before bed that dramatically improves sleep onset and quality.',
    steps: ['Choose a "sunset time" — one hour before you want to be asleep. Set a recurring alarm for it.','When the alarm goes off, silence all notifications and put devices in another room.','Replace the phone with one of: physical book, journal, conversation, gentle stretching, or a warm drink.','If you must use a device, switch to night mode, minimum brightness, and blue light glasses.','Keep a notepad beside your bed. If your mind generates to-dos or worries, write them down and let them go.','Notice how your mind feels different when you start this practice consistently after 3–5 days.','Protect this hour. It compounds — the better you sleep, the better your next day, which makes the next night easier.'],
    tip: '<strong>The data:</strong> People who use phones in the 30 minutes before bed take an average of 14 minutes longer to fall asleep and get 20 minutes less sleep per night. Over a year, that is 122 lost hours.' },

  { id: 'l28', cat: 'Movement', icon: '🧗', bg: '#FDF0EF', color: '#8A3030', title: 'Cold Exposure', time: '3 min',
    desc: 'Deliberate cold exposure builds stress resilience, boosts mood, and trains mental toughness.',
    steps: ['Start with the last 30 seconds of your shower on cold. Not cool — cold.','Breathe slowly and deliberately through the discomfort. The urge to jump out is the point.','Focus on your breath rather than the cold sensation. Long exhale through pursed lips.','Gradually extend to 1 minute, then 2, then 3 over several weeks.','The goal is not to feel nothing — it is to remain calm while feeling discomfort.','Notice the mood elevation afterward. Most people feel an alertness and lightness that lasts hours.','Do not do this first thing if you are new — shower warm first, then switch to cold at the end.'],
    tip: "<strong>The science:</strong> Cold exposure releases norepinephrine by up to 300% and dopamine by up to 250%. Andrew Huberman's research shows even 11 minutes per week of deliberate cold builds lasting stress resilience." },

  { id: 'l29', cat: 'Mindfulness', icon: '💭', bg: '#F0EDF7', color: '#5B4A8A', title: 'Loving-Kindness Meditation', time: '10 min',
    desc: 'Metta meditation — scientifically shown to increase positive emotions and reduce self-criticism.',
    steps: ['Sit comfortably. Close your eyes. Take 3 slow breaths.','Begin with yourself. Silently repeat: "May I be happy. May I be healthy. May I be safe. May I live with ease."','Feel the meaning of the words — do not rush. Let each phrase settle.','Now bring to mind someone you love easily — a close friend, a pet. Repeat: "May you be happy. May you be healthy. May you be safe. May you live with ease."','Expand to a neutral person — someone you see but do not know well. Offer them the same wishes.','If you feel ready, extend to someone difficult. This is hard at first. Start with mild difficulty.','Finally, expand to all beings everywhere. "May all beings be happy. May all beings be safe."','Rest in the warmth for a moment before opening your eyes.'],
    tip: '<strong>The research:</strong> Barbara Fredrickson found that even 7 weeks of loving-kindness meditation increased daily positive emotions and built lasting personal resources including mindfulness, purpose, and reduced illness.' },

  { id: 'l30', cat: 'Journaling', icon: '⚡', bg: '#E8F4F8', color: '#1E6A8A', title: 'Values Clarification', time: '20 min',
    desc: 'Knowing your values removes decision fatigue and creates a compass for every major life choice.',
    steps: ['Write down 20 things that matter deeply to you — people, activities, qualities, experiences. Do not filter.','Review your list. Circle the 10 that feel most essential — things you could not imagine a meaningful life without.','From those 10, choose your top 5. This will feel uncomfortable. That discomfort is the point.','For each of your top 5, write one sentence explaining why it matters so much.','Now evaluate: Where in your current life are you living in alignment with these values? Where are you not?','Identify one specific change you could make this week to close one gap between values and actions.','Return to this exercise every 6 months. Values evolve — and so should the life you build around them.'],
    tip: '<strong>Why this matters:</strong> Most anxiety and dissatisfaction comes from living out of alignment with values — often values absorbed from others rather than chosen deliberately. This exercise starts the reclamation.' },

  { id: 'l31', cat: 'Breathing', icon: '🏔️', bg: '#EDF5F1', color: '#2D7A5F', title: 'Buteyko Breathing', time: '10 min',
    desc: 'A breathing method developed by Russian doctor Konstantin Buteyko to reduce over-breathing and anxiety.',
    steps: ['Sit upright and breathe normally through your nose for 2 minutes. Notice your natural rhythm.','Take a gentle breath in through your nose, then a relaxed breath out.','After the exhale, pinch your nose closed with your fingers.','Hold until you feel the first definite urge to breathe — not panic, just the first real signal.','Release and breathe normally through your nose. Try to keep breathing calm — do not gasp.','Rest for 2–3 minutes of gentle nose breathing.','Repeat 5 times. Over weeks, your control pause will lengthen — a sign of improved CO₂ tolerance.'],
    tip: "<strong>The principle:</strong> Modern humans over-breathe chronically, expelling too much CO₂. CO₂ is not just waste — it's what signals your blood to release oxygen. Buteyko normalizes this, reducing anxiety and improving sleep." },

  { id: 'l32', cat: 'Sleep', icon: '☀️', bg: '#FDF3E3', color: '#9A6520', title: 'Morning Light Anchoring', time: '10 min',
    desc: 'Getting sunlight in your eyes within 30 minutes of waking resets your circadian clock for the entire day.',
    steps: ['Within 30 minutes of waking, go outside. Even on a cloudy day, outdoor light is 10–50x brighter than indoor light.','Stand or sit facing the direction of the sun — you do not need to look directly at it.','Stay for 5–10 minutes. On very bright days, 2–3 minutes may be enough.','Do not wear sunglasses during this time. The light needs to reach your retina.','If it is dark when you wake up, use a 10,000 lux light therapy lamp for 10 minutes.','Combine this with something pleasant — coffee, a short walk, stretching.','Do it consistently for 7 days and notice the change in energy, mood, and how easily you fall asleep at night.'],
    tip: "<strong>Why it works:</strong> Andrew Huberman's research shows that morning light sets a cortisol pulse at the right time, which directly determines when melatonin releases 12-14 hours later — controlling your sleep timing." },

  { id: 'l33', cat: 'Mindfulness', icon: '🪞', bg: '#F0EDF7', color: '#5B4A8A', title: 'Self-Compassion Break', time: '5 min',
    desc: "Kristin Neff's three-step practice for meeting your own pain with the care you'd offer a friend.",
    steps: ['When you notice you are struggling — stressed, failing, overwhelmed — pause.','Step 1 — MINDFULNESS: Acknowledge the pain without exaggerating or suppressing it. "This is a moment of suffering." "This is hard right now."','Step 2 — COMMON HUMANITY: Remind yourself you are not alone. "Suffering is part of being human." "Other people feel this way too." "I am not uniquely broken."','Step 3 — KINDNESS: Place one or both hands over your heart. Offer yourself words a caring friend would say: "May I be kind to myself in this moment." "May I give myself the compassion I need."','Stay with the warmth of your hands on your chest for 30 seconds.','This takes 2–3 minutes. It interrupts the self-criticism loop that makes difficulty worse.'],
    tip: "<strong>Kristin Neff's research</strong> shows self-compassion is more effective than self-esteem for resilience, motivation, and wellbeing — and unlike self-esteem, it does not require you to feel special or above average." },

  { id: 'l34', cat: 'Movement', icon: '🧘', bg: '#FDF0EF', color: '#8A3030', title: 'Yoga Nidra', time: '20 min',
    desc: 'Non-sleep deep rest — one hour of Yoga Nidra is said to equal 4 hours of sleep for neural recovery.',
    steps: ['Lie flat on your back with arms slightly away from your body, palms up.','Close your eyes. Set an intention — one sentence describing what you want to cultivate.','Rotate awareness through body parts rapidly: right thumb, index finger, middle finger, ring finger, little finger, palm, back of hand, wrist, forearm, elbow...','Continue through the entire body at a steady pace, spending 2–3 seconds on each point.','Do not try to relax — just move attention. Relaxation follows automatically.','After the body scan, move through pairs of opposites: heaviness/lightness, warmth/cold, pain/pleasure.','Return to your intention. Rest in open awareness for 5 minutes before slowly returning.'],
    tip: '<strong>Used by:</strong> the US military, professional athletes, and hospitals for recovery. Research shows it activates the same restorative brain states as sleep while maintaining a thread of consciousness.' },

  { id: 'l35', cat: 'Journaling', icon: '🗺️', bg: '#E8F4F8', color: '#1E6A8A', title: 'Weekly Review', time: '20 min',
    desc: 'A structured end-of-week reflection practice used by high performers across every field.',
    steps: ['Choose a consistent time — Sunday evening works well for most people. Block 20 minutes.','Review your calendar and task list from the past week. What actually happened versus what you planned?','Ask: What went well this week? Be specific and give yourself genuine credit.','Ask: What did not go as planned? What was the cause — circumstances, choices, or systems?','Ask: What did I learn this week — about my work, myself, or others?','Ask: What do I want to carry into next week? One intention, one commitment, one thing to let go of.','Write briefly on each. You are not journaling a novel — you are closing one chapter and opening another.'],
    tip: '<strong>Used by:</strong> David Allen (Getting Things Done), Tim Ferriss, and most high-output people interviewed about their systems. The weekly review is the single habit most correlated with consistent productivity and peace of mind.' },
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

// Goal → preferred categories mapping (in priority order)
const GOAL_TO_LEARN_CATS = {
  stress:    ['Breathing', 'Mindfulness', 'Sleep'],
  gratitude: ['Mindfulness', 'Journaling', 'Movement'],
  clarity:   ['Mindfulness', 'Journaling', 'Movement'],
  growth:    ['Journaling', 'Movement', 'Mindfulness'],
};

function getForYouTechniques() {
  const goal = localStorage.getItem('gj_goal') || 'gratitude';
  const h = new Date().getHours();
  const preferredCats = GOAL_TO_LEARN_CATS[goal] || GOAL_TO_LEARN_CATS.gratitude;

  // Pull techniques from preferred categories that aren't completed
  const undone = LEARN_CONTENT.filter(c => !learnDone.includes(c.id));
  const candidates = [];

  // First priority: undone in preferred cats
  preferredCats.forEach(cat => {
    candidates.push(...undone.filter(c => c.cat === cat));
  });

  // Time-of-day ranking — boost relevant techniques
  // Morning: energy/movement/breathing first
  // Evening: sleep/mindfulness first
  const isEvening = h >= 18 || h < 5;
  const isMorning = h >= 5 && h < 12;
  let scored = candidates.map(c => {
    let score = 0;
    if (isEvening && (c.cat === 'Sleep' || c.cat === 'Mindfulness')) score += 10;
    if (isMorning && (c.cat === 'Breathing' || c.cat === 'Movement')) score += 10;
    // Earlier in preferred cats list = higher base score
    score += (preferredCats.length - preferredCats.indexOf(c.cat)) * 2;
    return { card: c, score };
  });

  // Sort by score and dedupe by category
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const picks = [];
  for (const s of scored) {
    if (!seen.has(s.card.cat)) {
      picks.push(s.card);
      seen.add(s.card.cat);
    }
    if (picks.length === 3) break;
  }
  // Fill remaining slots if user has completed many items
  if (picks.length < 3) {
    for (const c of LEARN_CONTENT) {
      if (!picks.find(p => p.id === c.id)) {
        picks.push(c);
        if (picks.length === 3) break;
      }
    }
  }
  return picks;
}

function renderForYou() {
  const wrap = document.getElementById('learn-foryou-wrap');
  if (!wrap) return;
  const picks = getForYouTechniques();
  if (picks.length === 0) { wrap.innerHTML = ''; return; }

  const goal = localStorage.getItem('gj_goal') || 'gratitude';
  const goalLabels = {
    stress: 'reducing stress',
    gratitude: 'building gratitude',
    clarity: 'finding clarity',
    growth: 'personal growth',
  };

  wrap.innerHTML = `
    <div class="foryou-card">
      <div class="foryou-eyebrow">✨ For you</div>
      <div class="foryou-title">Techniques for ${goalLabels[goal]}</div>
      <div class="foryou-sub">Hand-picked based on your goal and time of day.</div>
      <div class="foryou-list">
        ${picks.map(c => {
          const col = CAT_COLORS[c.cat] || '#2D7A5F', bg = CAT_BG[c.cat] || '#EDF5F1';
          const isDone = learnDone.includes(c.id);
          return `<button class="foryou-item" onclick="scrollToTechnique('${c.id}')">
            <div class="foryou-item-icon" style="background:${bg};color:${col};">${c.icon}</div>
            <div class="foryou-item-info">
              <div class="foryou-item-title">${esc(c.title)}${isDone ? ' <span class="foryou-done">✓</span>' : ''}</div>
              <div class="foryou-item-meta"><span style="color:${col};">${c.cat}</span> · ${c.time}</div>
            </div>
            <div class="foryou-item-arrow">→</div>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function scrollToTechnique(id) {
  // Make sure card category is visible (or switch to All)
  const card = LEARN_CONTENT.find(c => c.id === id);
  if (!card) return;
  if (activeCat !== 'All' && activeCat !== card.cat) {
    activeCat = card.cat;
    renderLearn();
  }
  setTimeout(() => {
    const el = document.getElementById('lc-' + id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('open');
      // Brief highlight
      el.classList.add('foryou-highlight');
      setTimeout(() => el.classList.remove('foryou-highlight'), 2000);
    }
  }, 100);
}

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

  // For You — personalized recommendations
  renderForYou();

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
// Rotating opening questions — 3 picked randomly each session from this pool
const OPENING_QS = [
  "What is one thing you're genuinely grateful for today?",
  "Who made a positive difference in your life recently, and why?",
  "What's something small that brought you joy or comfort today?",
  "What's one thing that went better than expected today?",
  "What's one person you're lucky to have in your life right now?",
  "What's something you're looking forward to, no matter how small?",
  "What's one thing about today you want to remember a year from now?",
  "What made you smile today, even briefly?",
  "What's one thing you did today that your past self would be proud of?",
  "Who is someone you haven't thanked recently but should?",
  "What's one simple pleasure you experienced today?",
  "What's something working well in your life right now?",
];

const POOL = [
  "What challenge are you thankful for, even if it was difficult?",
  "What's one thing about yourself you appreciate right now?",
  "What moment from today would you want to remember forever?",
  "What opportunity are you most looking forward to?",
  "Describe something beautiful you noticed today.",
  "What relationship in your life are you most grateful for, and why?",
  "What's one thing you learned today, big or small?",
  "What's something you accomplished recently that you haven't celebrated?",
  "What does your body need right now that you haven't given it?",
  "What's one thing you're genuinely proud of this week?",
];

// Goal-specific question pools — 30 questions each
const GOAL_POOLS = {
  stress: [
    "What's one thing that felt heavy today that you can set down right now?",
    "What small thing brought you a moment of peace today, even briefly?",
    "What's one worry you've been carrying that you could choose to release tonight?",
    "Who or what helped you feel grounded today?",
    "What physical sensation in your body right now tells you how you're doing?",
    "What would you say to a friend going through exactly what you are?",
    "What's one thing you handled today that you didn't think you could?",
    "Where did you feel tension ease today, even for a moment?",
    "What's the smallest possible step you could take tomorrow to feel less overwhelmed?",
    "What are you catastrophizing about that probably won't happen?",
    "What's one thing you can control right now, in this moment?",
    "Who makes you feel safe? When did you last spend time with them?",
    "What does your body do when it's stressed? What does it need right now?",
    "What's one thing you've survived before that felt impossible at the time?",
    "What would you tell yourself at the start of this difficult period, knowing what you know now?",
    "What's the difference between what you're anxious about and what's actually happening?",
    "What's one small act of self-care you could do in the next 10 minutes?",
    "When was the last time you felt genuinely at peace? What was different?",
    "What are you holding onto that you know you need to let go of?",
    "What's one expectation of yourself you could ease up on right now?",
    "What part of today actually went okay, even if the rest didn't?",
    "What would a calmer version of you handle differently tomorrow?",
    "What's draining your energy most right now — and is it something you can change?",
    "What's one boundary you could set this week that would reduce your stress?",
    "What does rest actually look like for you — not just sleep, but genuine restoration?",
    "What's one thought pattern you keep coming back to that isn't helping you?",
    "If your stress were trying to tell you something, what would it say?",
    "What's one thing you accomplished today despite how you were feeling?",
    "What's something you've been putting off that, once done, would relieve real pressure?",
    "What would it feel like to go to bed tonight having fully released this day?",
  ],
  gratitude: [
    "Name one specific moment from today you wouldn't trade for anything.",
    "Who did something kind recently that you haven't acknowledged yet?",
    "What ordinary thing do you have that many people in the world don't?",
    "What part of your body are you grateful for today, and why?",
    "What about your past made today possible?",
    "What's a problem you have that is actually a sign of something good in your life?",
    "What did you take for granted this week that you actually appreciate?",
    "Describe a texture, smell, or sound that brought you quiet joy recently.",
    "What's one piece of technology that makes your life dramatically easier?",
    "What's a skill you have that took years to develop — and what does it enable you to do?",
    "Who believed in you before you believed in yourself?",
    "What's one conversation from this week that left you feeling better afterward?",
    "What's something beautiful about where you live that you forget to notice?",
    "What food or meal are you genuinely grateful exists in the world?",
    "What's one mistake you made that taught you something you needed to learn?",
    "What does your morning look like — and what part of it are you grateful for?",
    "What's one piece of art, music, or writing that has genuinely moved you?",
    "What's something your childhood self would be amazed by about your life right now?",
    "Who in your life consistently shows up for you, even quietly?",
    "What's one door that closed in your life that led to something better?",
    "What's a random act of kindness someone did for you that you still remember?",
    "What's something you used to struggle with that feels easier now?",
    "What's one thing about your personality that you've grown to appreciate?",
    "What's a place you've been to that you're grateful to have experienced?",
    "What's something in nature you find genuinely awe-inspiring?",
    "What's one opportunity you had that changed the direction of your life?",
    "What's something a stranger did recently that surprised you with its kindness?",
    "What's one book, podcast, or idea that shifted how you see the world?",
    "What's something simple about today — the weather, a moment, a taste — worth appreciating?",
    "What's one relationship in your life that has grown stronger through difficulty?",
  ],
  clarity: [
    "What decision have you been postponing, and what's really holding you back?",
    "What does the clearest, most honest part of you know that you've been ignoring?",
    "What would you do this week if you weren't afraid of getting it wrong?",
    "What's one thing you know you need to stop doing but haven't yet?",
    "What does your life look like in 5 years if you stay on your current path?",
    "What's the one thing that, if solved, would make everything else easier?",
    "What are you saying yes to that you actually want to say no to?",
    "What would the wiser future version of you tell you about this moment?",
    "What's a belief you hold about yourself that might not actually be true?",
    "What would you do differently if you knew you couldn't fail?",
    "What's the gap between who you are and who you want to be — and what creates it?",
    "What are you pretending not to know?",
    "What does success actually look like to you — not anyone else's version, yours?",
    "What's one area of your life where you're settling when you shouldn't be?",
    "What's the most important thing you could focus on this week?",
    "What's one relationship in your life that needs more honesty?",
    "If a close friend described you, what would they say that you'd find hard to hear?",
    "What do you keep thinking about that's trying to tell you something?",
    "What's the difference between what you want and what you think you should want?",
    "What would you do with your time if money wasn't a factor?",
    "What's one thing you've been overcomplicating that has a simple answer?",
    "What values do you say you have — and where are you actually living them?",
    "What's one habit that's inconsistent with the person you want to become?",
    "Where in your life are you being reactive instead of intentional?",
    "What's one thing you need to forgive yourself for in order to move forward?",
    "What conversation are you dreading that you know needs to happen?",
    "What's one commitment you've made to yourself that you keep breaking — and why?",
    "What would it mean to fully trust yourself? What's stopping you?",
    "What does your gut tell you about something you've been overthinking?",
    "What's one thing you'd regret not doing if you looked back in 10 years?",
  ],
  growth: [
    "What did you learn about yourself this week that surprised you?",
    "Where did you grow even though it felt uncomfortable?",
    "What habit or pattern are you finally starting to see clearly?",
    "What conversation do you need to have that you've been avoiding?",
    "What part of yourself are you still working on accepting?",
    "What's one boundary you maintained this week, or wish you had?",
    "Describe a moment you handled differently than you would have a year ago.",
    "What are you becoming that you couldn't have imagined becoming before?",
    "What's one fear you've faced recently, even partially?",
    "What's the most important lesson life has taught you so far?",
    "What version of yourself do you want to be in 12 months — specifically?",
    "Where are you growing in a way you haven't given yourself credit for?",
    "What's one thing you've changed your mind about in the last year?",
    "What does discipline look like in your life right now — where is it showing up?",
    "Who do you want to be in your relationships — and how close are you to that?",
    "What's one thing you used to be afraid of that no longer scares you?",
    "What's the hardest feedback you've received recently — and was it right?",
    "What's one area where you've been too hard on yourself?",
    "What's one area where you've let yourself off the hook too easily?",
    "What's something you've been avoiding that would actually help you grow?",
    "What does the gap between your current self and your best self look like?",
    "What's one relationship where you could show up better — and how?",
    "What have you outgrown that you're still holding onto?",
    "What's one new thing you tried recently, and what did it teach you?",
    "What's one moment this week where you chose growth over comfort?",
    "What's a story you tell yourself about who you are that might be limiting you?",
    "What would it look like to operate from your values every single day?",
    "What's one thing someone in your life models that you want to develop in yourself?",
    "What's the biggest obstacle to your growth right now — internal or external?",
    "If you could give your younger self one piece of advice, what would it be — and do you live by it?",
  ],
};

function pickQs() {
  const goal = localStorage.getItem('gj_goal');
  const pool = (goal && GOAL_POOLS[goal]) ? GOAL_POOLS[goal] : POOL;

  // Pick 2 random opening questions (never repeat in same session)
  const openingShuffled = [...OPENING_QS].sort(() => Math.random() - 0.5);
  const opening = [openingShuffled[0], openingShuffled[1]];

  // Pick 3 goal-specific questions
  const goalShuffled = [...pool].sort(() => Math.random() - 0.5);

  return [...opening, goalShuffled[0], goalShuffled[1], goalShuffled[2]];
}

// ══════════════════════════════════════════════════
// BREATHWORK
// ══════════════════════════════════════════════════
const EXERCISES = { box: { name: 'Box Breathing', pattern: '4 in · 4 hold · 4 out · 4 hold', desc: 'Equal counts create perfect nervous system balance.', rounds: 4, phases: [{ w: 'Inhale', d: 4, scale: 1.13, ex: false, narr: 'Breathe in… two… three… four…' }, { w: 'Hold', d: 4, scale: 1.13, ex: false, narr: 'Hold… two… three… four…' }, { w: 'Exhale', d: 4, scale: 0.88, ex: true, narr: 'Breathe out… two… three… four…' }, { w: 'Hold', d: 4, scale: 0.88, ex: true, narr: 'Hold… two… three… four…' }] }, f478: { name: '4-7-8 Breathing', pattern: '4 in · 7 hold · 8 out', desc: 'The extended exhale activates your parasympathetic system.', rounds: 4, phases: [{ w: 'Inhale', d: 4, scale: 1.13, ex: false, narr: 'Breathe in slowly… two… three… four…' }, { w: 'Hold', d: 7, scale: 1.13, ex: false, narr: 'Hold gently… three… four… five… six… seven…' }, { w: 'Exhale', d: 8, scale: 0.88, ex: true, narr: 'Slowly breathe all the way out… five… six… seven… eight…' }] }, belly: { name: 'Belly Breathing', pattern: '5 in · 5 out · 5 rounds', desc: 'Deep diaphragmatic breaths signal safety to your nervous system.', rounds: 5, phases: [{ w: 'Inhale', d: 5, scale: 1.15, ex: false, narr: 'Breathe deep into your belly… two… three… four… five…' }, { w: 'Exhale', d: 5, scale: 0.88, ex: true, narr: 'Slowly release… two… three… four… five…' }] } };
let chosenEx = 'box', bTimer = null, bRound = 0, bPhase = 0, bCount = 0, bGoing = false;

function getRecommendedBreath() {
  // Recommend based on goal + time of day
  const goal = localStorage.getItem('gj_goal');
  const h = new Date().getHours();
  // Stress users get 4-7-8 (most calming)
  // Morning gets box (balanced energy)
  // Evening/night gets 4-7-8 (sleep prep)
  // Default gets belly (gentlest)
  if (goal === 'stress') return 'f478';
  if (h >= 18 || h < 5) return 'f478';
  if (h < 12) return 'box';
  return 'belly';
}

function renderBreathOpts() {
  // Restore last-used choice on each render — improves repeat-user UX
  const lastUsed = localStorage.getItem('gj_last_breath');
  const recommended = getRecommendedBreath();
  if (!chosenEx) {
    // Auto-choose recommended (or last used if user has used the app before)
    chosenEx = lastUsed && EXERCISES[lastUsed] ? lastUsed : recommended;
  }

  // Update intro sub based on time of day
  const introSub = document.getElementById('breath-intro-sub');
  if (introSub) {
    const h = new Date().getHours();
    if (h < 12) introSub.textContent = 'Morning breath sets your nervous system up for a reflective day. One minute is all it takes.';
    else if (h < 17) introSub.textContent = 'A short breathing exercise resets the afternoon and prepares your mind for honest reflection.';
    else if (h < 21) introSub.textContent = 'Evening breath helps you transition from doing into being — the best state for journaling.';
    else introSub.textContent = 'Night breath signals your body it\'s safe to slow down. Your answers will come more easily.';
  }

  const el = document.getElementById('breath-opts');
  if (!el) return;

  el.innerHTML = Object.entries(EXERCISES).map(([k, e]) => {
    const isRecommended = k === recommended;
    const isLastUsed = k === lastUsed && k !== recommended;
    const badge = isRecommended ? '<span class="breath-badge breath-badge-rec">Recommended for now</span>'
                : isLastUsed ? '<span class="breath-badge breath-badge-last">Last used</span>'
                : '';
    return `<button class="breath-opt ${k === chosenEx ? 'picked' : ''}" onclick="pickEx('${k}')">
      ${badge}
      <div class="breath-opt-head">
        <span class="breath-opt-name">${e.name}</span>
        <span class="breath-opt-pill">${e.pattern}</span>
      </div>
      <div class="breath-opt-desc">${e.desc}</div>
    </button>`;
  }).join('');
}

function pickEx(k) {
  chosenEx = k;
  localStorage.setItem('gj_last_breath', k);
  renderBreathOpts();
}
function launchBreath() { const e = EXERCISES[chosenEx]; document.getElementById('bex-tag').textContent = e.name; document.getElementById('bex-pattern').textContent = e.pattern; resetBreath(); goPage('breathex'); if (voiceOn) say(`Beginning ${e.name}. Press start when ready.`); }
function resetBreath() { bRound = 0; bPhase = 0; bCount = 0; bGoing = false; if (bTimer) clearInterval(bTimer); const g = id => document.getElementById(id); if (g('ring-word')) g('ring-word').textContent = 'Ready'; if (g('ring-count')) g('ring-count').textContent = ''; if (g('bex-hint')) g('bex-hint').textContent = "Press start when you're ready"; const sb = g('bex-start'); if (sb) { sb.disabled = false; sb.textContent = 'Start'; } const r = g('ring'); if (r) { r.style.transform = 'scale(1)'; r.classList.remove('exhale'); } renderRoundDots(); }
function renderRoundDots() { const rounds = EXERCISES[chosenEx].rounds; const el = document.getElementById('round-dots'); if (!el) return; el.innerHTML = Array(rounds).fill(0).map((_, i) => `<div class="round-dot ${i < bRound ? 'lit' : ''}"></div>`).join(''); }
function startBreath() { if (bGoing) return; bGoing = true; const sb = document.getElementById('bex-start'); if (sb) sb.disabled = true; if (voiceOn) say("Let's begin. Follow the circle.", () => setTimeout(runPhase, 500)); else setTimeout(runPhase, 300); }
function runPhase() { const ex = EXERCISES[chosenEx]; if (bRound >= ex.rounds) { finishBreath(); return; } const p = ex.phases[bPhase]; bCount = p.d; const g = id => document.getElementById(id); if (g('ring-word')) g('ring-word').textContent = p.w; if (g('ring-count')) g('ring-count').textContent = bCount; if (g('ring')) { g('ring').style.transform = `scale(${p.scale})`; g('ring').classList.toggle('exhale', p.ex); g('ring').style.transitionDuration = p.d + 's'; } if (g('bex-hint')) g('bex-hint').textContent = `Round ${bRound + 1} of ${ex.rounds}`; const go = () => { bTimer = setInterval(() => { bCount--; const bc = document.getElementById('ring-count'); if (bc) bc.textContent = bCount > 0 ? bCount : ''; if (bCount <= 0) { clearInterval(bTimer); bPhase++; if (bPhase >= ex.phases.length) { bPhase = 0; bRound++; renderRoundDots(); } setTimeout(runPhase, 400); } }, 1000); }; if (voiceOn) say(p.narr, go); else go(); }
function finishBreath() { bGoing = false; const g = id => document.getElementById(id); if (g('ring-word')) g('ring-word').textContent = 'Done'; if (g('ring-count')) g('ring-count').textContent = ''; if (g('bex-hint')) g('bex-hint').textContent = 'Beautifully done.'; if (g('ring')) g('ring').style.transform = 'scale(1)'; if (voiceOn) say("Beautiful. Carry this calm into your journal.", () => goMoodBefore()); else setTimeout(goMoodBefore, 1200); }
function skipToJournal() {
  stopAudio();
  if (bTimer) clearInterval(bTimer);
  bGoing = false;
  voiceOn = false;
  const b = document.getElementById('voiceBtn');
  if (b) { b.textContent = '🔈 Voice'; b.classList.remove('on'); }
  goMoodBefore();
}

// ══════════════════════════════════════════════════
// SESSION FLOW
// ══════════════════════════════════════════════════
let sessionQs = [], qIdx = 0, qAnswers = [], inputMode = 'voice';
function beginSession() { moodBefore = null; moodAfter = null; sessionQs = pickQs(); qIdx = 0; qAnswers = Array(sessionQs.length).fill(''); inputMode = 'voice'; chosenEx = null; renderBreathOpts(); goPage('breath'); }
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
  const voiceUI = `<div class="mic-wrap">
<div class="mic-ring-wrap">
  <div class="mic-ring" id="mic-ring"
    onmousedown="startRec()" onmouseup="stopRec()" onmouseleave="stopRec()"
    ontouchstart="event.preventDefault();startRec()" ontouchend="event.preventDefault();stopRec()">
    <svg class="mic-svg" viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 9a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V23h-2v-2.06A9 9 0 0 1 3 12h2z"/></svg>
  </div>
</div>
<span class="mic-status" id="mic-status">${saved ? 'Hold to re-record' : 'Hold to speak'}</span>
</div>
<div class="answer-display ${saved ? '' : 'blank'}" id="answer-display">${saved || 'Your answer will appear here as you speak…'}</div>`;
  const typeUI = `<textarea class="answer-textarea" id="type-area" placeholder="Write your thoughts here…" oninput="qAnswers[qIdx]=this.value;clearTimeout(window._draftTimer);window._draftTimer=setTimeout(saveDraft,1500);">${saved || ''}</textarea>`;
  document.getElementById('journal-inner').innerHTML = `<div class="progress-track">${segs}</div><div class="q-card"><div class="q-meta"><span class="q-label">Question ${qIdx + 1} of ${sessionQs.length}</span><button class="q-read-btn" id="read-btn" onclick="readQ()">🔊 Read aloud</button></div><div class="q-text">${sessionQs[qIdx]}</div></div><div class="mode-switcher"><button class="mode-pill ${inputMode === 'voice' ? 'on' : ''}" onclick="setMode('voice')">🎙 Speak</button><button class="mode-pill ${inputMode === 'type' ? 'on' : ''}" onclick="setMode('type')">⌨️ Type</button></div><div id="input-zone">${inputMode === 'voice' ? voiceUI : typeUI}</div><div class="btn-row" style="margin-top:1.5rem;"><button class="btn" id="skip-btn" onclick="skipQ()">Skip</button><button class="btn solid" id="next-btn" onclick="nextQ()">${qIdx < sessionQs.length - 1 ? 'Next →' : 'Finish'}</button></div>`;
  if (voiceOn) setTimeout(() => tts(sessionQs[qIdx]), 300);
}
function readQ() { const b = document.getElementById('read-btn'); if (b) b.classList.add('reading'); tts(sessionQs[qIdx], () => { const b2 = document.getElementById('read-btn'); if (b2) b2.classList.remove('reading'); }); }
function setMode(m) { if (inputMode === 'type') { const ta = document.getElementById('type-area'); if (ta) qAnswers[qIdx] = ta.value; } if (recOn) stopRec(); inputMode = m; renderQ(); }
function toggleRec() { recOn ? stopRec() : startRec(); }

async function startRec() {
  stopAudio();

  try {
    const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;
    if (!SpeechRecognition) {
      const s = document.getElementById('mic-status');
      if (s) s.textContent = 'Microphone not available on this device';
      return;
    }

    // Request permission
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted' && perm.microphone !== 'granted') {
      const s = document.getElementById('mic-status');
      if (s) s.textContent = 'Microphone access denied — enable in Settings';
      return;
    }

    recOn = true;
    const r = document.getElementById('mic-ring'); if (r) r.classList.add('live');
    const s = document.getElementById('mic-status'); if (s) { s.textContent = 'Release to stop'; s.classList.add('recording'); }
    const nb = document.getElementById('next-btn'); if (nb) nb.disabled = true;
    const sb = document.getElementById('skip-btn'); if (sb) sb.disabled = true;

    let accumulated = qAnswers[qIdx] || '';

    await SpeechRecognition.start({
      language: 'en-US',
      maxResults: 2,
      prompt: 'Speak your answer',
      partialResults: true,
      popup: false,
    });

    SpeechRecognition.addListener('partialResults', (data) => {
      const partial = data.matches ? data.matches[0] : '';
      const ad = document.getElementById('answer-display');
      if (ad) { ad.classList.remove('blank'); ad.textContent = (accumulated ? accumulated + ' ' : '') + partial; }
    });

    SpeechRecognition.addListener('listeningState', (data) => {
      if (data.status === 'stopped') {
        recOn = false;
        const r2 = document.getElementById('mic-ring'); if (r2) r2.classList.remove('live');
        const s2 = document.getElementById('mic-status');
        if (s2) { s2.textContent = qAnswers[qIdx] ? 'Hold to add more' : 'Hold to speak'; s2.classList.remove('recording'); }
        const nb2 = document.getElementById('next-btn'); if (nb2) nb2.disabled = false;
        const sb2 = document.getElementById('skip-btn'); if (sb2) sb2.disabled = false;
        SpeechRecognition.removeAllListeners();
      }
    });

    SpeechRecognition.addListener('finalResults', (data) => {
      const final = data.matches ? data.matches[0] : '';
      if (final) {
        accumulated = (accumulated ? accumulated + ' ' : '') + final;
        qAnswers[qIdx] = accumulated;
        const ad = document.getElementById('answer-display');
        if (ad) { ad.classList.remove('blank'); ad.textContent = accumulated; }
      }
    });

  } catch(e) {
    // Fallback to Web Speech API for browser testing
    console.log('Capacitor SR not available, using Web Speech API:', e.message);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice recording is not supported on this device.'); return; }
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onstart = () => {
      recOn = true;
      const r = document.getElementById('mic-ring'); if (r) r.classList.add('live');
      const s = document.getElementById('mic-status'); if (s) { s.textContent = 'Release to stop'; s.classList.add('recording'); }
      const nb = document.getElementById('next-btn'); if (nb) nb.disabled = true;
      const sb = document.getElementById('skip-btn'); if (sb) sb.disabled = true;
    };
    rec.onresult = (e) => {
      let fin = qAnswers[qIdx] || '', int = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += (fin ? ' ' : '') + e.results[i][0].transcript;
        else int += e.results[i][0].transcript;
      }
      qAnswers[qIdx] = fin;
      const ad = document.getElementById('answer-display');
      if (ad) { ad.classList.remove('blank'); ad.textContent = fin + (int ? ' ' + int : ''); }
    };
    rec.onend = () => {
      recOn = false;
      const r = document.getElementById('mic-ring'); if (r) r.classList.remove('live');
      const s = document.getElementById('mic-status');
      if (s) { s.textContent = qAnswers[qIdx] ? 'Hold to add more' : 'Hold to speak'; s.classList.remove('recording'); }
      const nb = document.getElementById('next-btn'); if (nb) nb.disabled = false;
      const sb = document.getElementById('skip-btn'); if (sb) sb.disabled = false;
      const ad = document.getElementById('answer-display');
      if (ad) {
        if (!qAnswers[qIdx]) { ad.classList.add('blank'); ad.textContent = 'Your answer will appear here as you speak…'; }
        else { ad.classList.remove('blank'); ad.textContent = qAnswers[qIdx]; }
      }
    };
    rec.onerror = (e) => { if (e.error !== 'aborted') { recOn = false; renderQ(); } };
    rec.start();
  }
}

async function stopRec() {
  if (rec) { rec.stop(); rec = null; return; }
  try {
    const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;
    if (SpeechRecognition) await SpeechRecognition.stop();
  } catch(e) { /* not running */ }
  recOn = false;
  const r = document.getElementById('mic-ring'); if (r) r.classList.remove('live');
  const s = document.getElementById('mic-status');
  if (s) { s.textContent = qAnswers[qIdx] ? 'Hold to add more' : 'Hold to speak'; s.classList.remove('recording'); }
  const nb = document.getElementById('next-btn'); if (nb) nb.disabled = false;
  const sb = document.getElementById('skip-btn'); if (sb) sb.disabled = false;
}
function stopRec() { if (rec) { rec.stop(); rec = null; } }
function nextQ() { if (recOn) return; if (inputMode === 'type') { const ta = document.getElementById('type-area'); if (ta) qAnswers[qIdx] = ta.value; } saveDraft(); if (qIdx < sessionQs.length - 1) { qIdx++; renderQ(); } else { goMoodAfter(); } }
function skipQ() { if (recOn) return; if (inputMode === 'type') { const ta = document.getElementById('type-area'); if (ta) qAnswers[qIdx] = ta.value; } saveDraft(); nextQ(); }

async function finishSession() {
  stopAudio();
  const entryDate = reviveDate || new Date().toISOString();
  const entry = { date: entryDate, questions: [...sessionQs], answers: [...qAnswers], moodBefore, moodAfter };
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
  // Success — clear the draft
  clearDraft();
  // Mark revive as done so card disappears
  if (reviveDate) {
    const revivedKey = 'gj_revived_' + (currentUser?.id || '');
    const revived = JSON.parse(localStorage.getItem(revivedKey) || '[]');
    const d = new Date(reviveDate); d.setHours(0,0,0,0);
    revived.push(d.toDateString());
    localStorage.setItem(revivedKey, JSON.stringify(revived));
    reviveDate = null;
  }
  // Mark challenge day complete if this was a challenge session
  if (window._activeChallenge) {
    completeChallengeDay(window._activeChallenge);
  }
  const saved = cachedEntries[0] || entry;
  renderSummaryPage(saved);
  goPage('summary');
  if (voiceOn) setTimeout(() => say("Well done. Your entry has been saved to the cloud. Take a moment to appreciate yourself for showing up today."), 600);

  // Log mindful minutes to Apple Health (silent, non-blocking)
  logMindfulMinutesToHealth(saved.date || entry.date, estimateSessionMinutes(saved));

  // Check for milestone after a short delay so summary renders first
  setTimeout(() => {
    checkMilestone(getEntries().length);
    checkStreakMilestone(streak());
  }, 1800);
}

function renderSummaryPage(entry) {
  // Normalize field names — pre-save object uses camelCase, Supabase returns snake_case
  const moodBefore = entry.moodBefore ?? entry.mood_before ?? null;
  const moodAfter  = entry.moodAfter  ?? entry.mood_after  ?? null;

  const date = new Date(entry.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const s = streak();
  const totalEntries = getEntries().length;

  // Calculate session stats
  const totalWords = (entry.answers || []).reduce((sum, a) => sum + (a ? a.trim().split(/\s+/).filter(Boolean).length : 0), 0);
  const sessionMinutes = Math.max(2, Math.round(totalWords / 80)); // ~80 wpm reading aloud
  const answeredCount = (entry.answers || []).filter(a => a && a.trim()).length;

  // Personalised message based on streak + mood
  const lift = moodBefore != null && moodAfter != null ? moodAfter - moodBefore : null;
  const messages = [
    { cond: lift >= 2,  msg: "Look at that — you came in one way and you're leaving another. That shift you just felt? That's what this practice creates." },
    { cond: lift === 1, msg: "You showed up, you reflected, and you feel a little better for it. That's the whole point. One entry at a time." },
    { cond: s >= 30,    msg: "Thirty days or more. You have built something real — a practice that belongs to you. The science says your brain is already different for it." },
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

  // Wisdom drop — pick a contextual quote
  const wisdomQuote = QUOTES_OF_DAY[Math.floor(Math.random() * QUOTES_OF_DAY.length)];

  // Tomorrow's preview question (rotating)
  const goal = localStorage.getItem('gj_goal');
  const tomorrowPool = (goal && GOAL_POOLS[goal]) ? GOAL_POOLS[goal] : POOL;
  const tomorrowQuestion = tomorrowPool[Math.floor(Math.random() * tomorrowPool.length)];

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

      <div class="cel-session-stats">
        <div class="cel-session-stat">
          <span class="cel-session-stat-val">${sessionMinutes}</span>
          <span class="cel-session-stat-key">min on yourself</span>
        </div>
        <div class="cel-session-stat">
          <span class="cel-session-stat-val">${totalWords}</span>
          <span class="cel-session-stat-key">words written</span>
        </div>
        <div class="cel-session-stat">
          <span class="cel-session-stat-val">${answeredCount}/${entry.questions.length}</span>
          <span class="cel-session-stat-key">questions</span>
        </div>
      </div>

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

      <div class="cel-wisdom">
        <div class="cel-wisdom-eyebrow">A thought to carry with you</div>
        <div class="cel-wisdom-quote">"${esc(wisdomQuote.text)}"</div>
        <div class="cel-wisdom-author">— ${esc(wisdomQuote.author)}</div>
      </div>

      <div class="cel-tomorrow">
        <div class="cel-tomorrow-eyebrow">🌱 Tomorrow's question</div>
        <div class="cel-tomorrow-q">"${esc(tomorrowQuestion)}"</div>
        <div class="cel-tomorrow-sub">Save it. Sleep on it. Bring your answer tomorrow.</div>
      </div>

      <div class="cel-actions">
        <button class="btn" onclick="goPage('history')">View history</button>
        <button class="btn solid" onclick="goPage('home')">Back home &rarr;</button>
      </div>

      ${entry.id ? `<div class="cel-photo-wrap">${renderPhotoSection(entry.id, true)}</div>` : ''}

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

let _quoteFontReady = false;

async function _loadQuoteFonts() {
  if (_quoteFontReady) return;

  // On native iOS (Capacitor WebView), skip remote font loading — Lora isn't packaged
  // with the app so the fetch will fail or stall. Canvas falls back to system serif,
  // which is still a good-looking Georgia-like font on iOS.
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    _quoteFontReady = true;
    return;
  }

  // On web, try to load Lora with a 2-second timeout
  try {
    const loraRegular = new FontFace('Lora', "url(https://fonts.gstatic.com/s/lora/v35/0QI6MX1D_JOxE7fSYN3Kts3hrQ.woff2)", { weight: '400', style: 'normal' });
    const loraItalic  = new FontFace('Lora', "url(https://fonts.gstatic.com/s/lora/v35/0QI8MX1D_JOxE7fSYN3Kts3lrA.woff2)", { weight: '400', style: 'italic' });
    const loraMedium  = new FontFace('Lora', "url(https://fonts.gstatic.com/s/lora/v35/0QI6MX1D_JOxE7fSYN3Kts3irQ.woff2)", { weight: '500', style: 'normal' });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('font timeout')), 2000));
    const fontsLoaded = Promise.all([loraRegular.load(), loraItalic.load(), loraMedium.load()]);
    const [f1, f2, f3] = await Promise.race([fontsLoaded, timeout]);
    if (f1 && f2 && f3) {
      document.fonts.add(f1); document.fonts.add(f2); document.fonts.add(f3);
    }
  } catch(e) {
    console.log('Fonts failed to load, using serif fallback:', e?.message);
  }
  _quoteFontReady = true;
}

function openQuoteCard(text, date) {
  const modal = document.getElementById('quote-card-modal');
  if (!modal) return;
  modal.dataset.text = JSON.stringify(text);
  modal.dataset.date = JSON.stringify(date);
  // Reset to default style
  currentCardStyle = 'forest';
  document.querySelectorAll('.card-style-btn').forEach(b => b.classList.toggle('active', b.dataset.style === 'forest'));
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

// Card style themes
const CARD_STYLES = {
  forest:   { bg: '#FAF8F4', card: '#FFFFFF', accent: '#2D7A5F', ink: '#1C1A17', ink60: '#6B6560', ink30: '#B5B0A8', accent2: '#7BBDA4' },
  warm:     { bg: '#FFF8F0', card: '#FFFEFA', accent: '#C97B3D', ink: '#2A1F18', ink60: '#7A6555', ink30: '#BFA899', accent2: '#E5A876' },
  ocean:    { bg: '#E8F4F8', card: '#FFFFFF', accent: '#1E6A8A', ink: '#0F2A3A', ink60: '#557080', ink30: '#9FB4C0', accent2: '#5BA8C4' },
  sunset:   { bg: '#FFE8E0', card: '#FFFAF7', accent: '#D26A4F', ink: '#2A1410', ink60: '#7A4A40', ink30: '#C4998E', accent2: '#F09473' },
  midnight: { bg: '#1E1C2E', card: '#2A2740', accent: '#A89BD9', ink: '#F0EDE8', ink60: '#A09AB8', ink30: '#5C5780', accent2: '#7E70BF' },
};
let currentCardStyle = 'forest';

function changeCardStyle(style) {
  currentCardStyle = style;
  document.querySelectorAll('.card-style-btn').forEach(b => b.classList.toggle('active', b.dataset.style === style));
  const modal = document.getElementById('quote-card-modal');
  if (!modal) return;
  const text = modal.dataset.text;
  const date = modal.dataset.date;
  if (text && date) {
    const preview = document.getElementById('quote-card-preview');
    if (preview) preview.src = '';
    setTimeout(() => renderQuoteCard(JSON.parse(text), JSON.parse(date)), 60);
  }
}

async function renderQuoteCard(text, date) {
  try {
    await _loadQuoteFonts();

    const canvas = document.getElementById('quote-card-canvas');
    if (!canvas) return;
    const SIZE = 1080;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    const isDark = currentCardStyle === 'midnight';
    const theme = CARD_STYLES[currentCardStyle] || CARD_STYLES.forest;

    // ── Background ──
    const bg    = theme.bg;
    const card  = theme.card;
    const sage  = theme.accent;
    const sageMid = theme.accent2;
    const ink   = theme.ink;
    const ink60 = theme.ink60;
    const ink30 = theme.ink30;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ── Subtle grain overlay (skip silently if canvas rejects large ImageData) ──
    try {
      const grainData = ctx.createImageData(SIZE, SIZE);
      for (let i = 0; i < grainData.data.length; i += 4) {
        const v = Math.random() > 0.5 ? 255 : 0;
        grainData.data[i] = grainData.data[i+1] = grainData.data[i+2] = v;
        grainData.data[i+3] = Math.floor(Math.random() * 8);
      }
      ctx.putImageData(grainData, 0, 0);
    } catch(grainErr) {
      // Grain is purely decorative — skip if the WebView chokes on large ImageData
    }

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
  } catch(e) {
    console.log('Quote card render failed:', e?.message, e?.stack);
    // Show an error in the spinner area instead of leaving it spinning forever
    const spinner = document.getElementById('quote-card-spinner');
    if (spinner) {
      spinner.innerHTML = `<div style="font-size:13px;color:var(--ink-60);text-align:center;padding:20px;line-height:1.5;"><div style="font-weight:500;color:var(--ink);margin-bottom:6px;">Couldn't generate card</div><div style="font-size:11px;color:var(--ink-30);">${esc(e?.message || 'unknown error')}</div></div>`;
    }
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
initBV();
// Start the app once DOM and scripts are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}