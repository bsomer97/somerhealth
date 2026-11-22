// App shell: state, top-level render, sign-in screens, shared helpers,
// the intensity engine and the nutrition math. Each tab's screen lives in
// js/views/*.js and registers its button handlers in `Actions`.
// No frameworks: every screen is a function that returns HTML for the
// current data, and render() redraws the current tab.

// ---------- constants ----------

const REPS_OPTIONS = [5, 6, 8, 10, 12, 15, 20];
const CARDIO_REPS_OPTIONS = [1];
const MUSCLE_LIST = [
  "abdominals", "abductors", "adductors", "biceps", "calves", "chest",
  "forearms", "glutes", "hamstrings", "lats", "lower back", "middle back",
  "neck", "quadriceps", "shoulders", "traps", "triceps"
];
const EQUIPMENT_OPTIONS = [
  "barbell", "dumbbell", "machine", "cable", "kettlebells", "bands",
  "body only", "medicine ball", "exercise ball", "foam roll", "e-z curl bar", "other"
];
const CATEGORY_TYPES = ["machine", "mat", "weight", "cardio"];
const LBS_TO_KG = 0.45359237;

// ---------- UI state (what's on screen; never saved to the cloud) ----------

const state = {
  view: "schedule",
  viewAs: null,               // uid whose data is on screen (you or your partner)
  addingForDate: null,
  scheduleWeekOffset: 0,
  openSessionId: null,
  libraryContext: null,       // session id we're adding exercises into
  libraryQuery: "",
  libraryCategory: "all",
  libraryMechanic: "all",
  libraryMuscle: "all",
  libraryFavoritesOnly: false,
  showAddExerciseForm: false,
  libraryMode: "exercises",   // exercises | workouts
  draftWorkout: null,         // { exercises: [] } while building a new saved workout
  editingTemplateId: null,
  lightbox: null,
  pendingAddExercise: null,
  expandedExercise: null,
  showTemplatePicker: false,
  editingSessionDetails: false,
  summaryWeekOffset: 0,
  foodDate: null,             // "YYYY-MM-DD" shown on the Food tab
  showFoodPicker: false,
  foodQuery: "",
  mealForm: null,             // { id?, name, serving, calories, protein } while adding/editing a meal
  showMedForm: false,
  medFormEditingId: null,
  medFormTimes: ["08:00"],
  medFormDays: [0, 1, 2, 3, 4, 5, 6],
  showGoalForm: false,
  goalFormType: "weeklySessions",
  importStatus: "",
  loadingRanges: {}
};

const root = () => document.getElementById("view-root");
const Actions = {};   // data-action name -> handler(el, event)

function isMine() { return state.viewAs === Store.me; }
function viewedName() { return Store.member(state.viewAs).name; }
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- App lifecycle (called by cloud.js) ----------

const App = {
  renderTimer: null,
  pendingRender: false,
  signedIn: false,

  onAuth(user) {
    if (!user) {
      this.signedIn = false;
      Store.me = null;
      DataCache.reset();
      renderAuthScreen("login");
      return;
    }
    if (!window.APP_CONFIG.MEMBERS[user.uid]) {
      this.signedIn = false;
      renderAuthScreen("notAllowed", user);
      return;
    }
    this.signedIn = true;
    Store.me = user.uid;
    state.viewAs = user.uid;
    state.foodDate = null;
    document.body.classList.remove("auth-mode");
    render();
  },

  // Data arrives in bursts; batch them, and never redraw while you're
  // typing in a field (it would steal focus) — wait until you leave it.
  scheduleRender() {
    if (!this.signedIn) return;
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      const a = document.activeElement;
      const typing = a && root().contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)
        && !["checkbox", "radio", "file", "button"].includes(a.type);
      if (typing) { this.pendingRender = true; return; }
      render();
    }, 120);
  },

  showSetupNeeded() { renderAuthScreen("setup"); },

  onCloudError(err) {
    const code = err && err.code;
    let msg = "Couldn't sync a change. It'll retry automatically.";
    if (code === "permission-denied") msg = "The database refused this request. Check that both user IDs are in firestore.rules AND js/config.js.";
    showToast(msg, true);
  }
};
window.App = App;

document.addEventListener("focusout", () => {
  if (App.pendingRender) {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && root().contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      App.pendingRender = false;
      render();
    }, 50);
  }
});

function showToast(msg, isError) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = "toast"; }, isError ? 6000 : 2500);
}

// ---------- sign-in screens ----------

function renderAuthScreen(kind, user) {
  document.body.classList.add("auth-mode");
  const name = esc(window.APP_CONFIG ? window.APP_CONFIG.APP_NAME : "ourHealth");
  let body = "";
  if (kind === "setup") {
    body = `<div class="card"><h3>Almost there</h3><div class="session-sub">
      Open <b>js/config.js</b> and paste in your Firebase config and your two user IDs, then commit it.
      The README walks through it.</div></div>`;
  } else if (kind === "notAllowed") {
    body = `<div class="card"><h3>This account isn't on the list</h3>
      <div class="session-sub" style="margin-bottom:12px;">Signed in as ${esc(user.email)} (ID: <code>${esc(user.uid)}</code>).
      Only the two accounts in js/config.js can use this app.</div>
      <button class="btn btn-block" data-action="sign-out">Sign out</button></div>`;
  } else {
    body = `
      <form class="card" id="login-form">
        <div class="form-field"><label>Email</label>
          <input id="login-email" type="email" autocomplete="username" required></div>
        <div class="form-field"><label>Password</label>
          <input id="login-password" type="password" autocomplete="current-password" required></div>
        <button class="btn btn-block" type="submit">Sign in</button>
        <div id="login-status" class="session-sub" style="margin-top:10px;"></div>
        <button class="link-btn" type="button" data-action="reset-password">Forgot password?</button>
      </form>`;
  }
  root().innerHTML = `<div class="auth-wrap"><div class="auth-logo">${name}</div>${body}</div>`;
}

Actions["sign-out"] = () => {
  if (window.Cloud) window.Cloud.signOut();
};

Actions["reset-password"] = () => {
  const email = (document.getElementById("login-email") || {}).value;
  const status = document.getElementById("login-status");
  if (!email) { status.textContent = "Type your email above first."; return; }
  window.Cloud.resetPassword(email)
    .then(() => { status.textContent = "Password reset email sent."; })
    .catch((err) => { status.textContent = "Couldn't send reset email: " + err.code; });
};

document.addEventListener("submit", (e) => {
  if (e.target.id !== "login-form") return;
  e.preventDefault();
  const status = document.getElementById("login-status");
  status.textContent = "Signing in…";
  window.Cloud.signIn(
    document.getElementById("login-email").value.trim(),
    document.getElementById("login-password").value
  ).catch((err) => {
    status.textContent = err.code === "auth/invalid-credential" ? "Wrong email or password." : "Sign-in failed: " + err.code;
  });
});

// ---------- top-level render ----------

function topLevelTab() {
  if (state.view === "sessionDetail") return "schedule";
  return state.view;
}

function render() {
  if (!App.signedIn) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === topLevelTab()));
  renderPersonSwitch();

  if (!Library.loaded || (!DataCache.firstDataArrived && DataCache.all("profiles").length === 0)) {
    root().innerHTML = `<div class="empty-state">Loading…</div>`;
    if (Library.loaded && !DataCache.firstDataArrived) setTimeout(() => { DataCache.firstDataArrived = true; render(); }, 2500);
    return;
  }

  const views = {
    schedule: viewSchedule,
    sessionDetail: viewSessionDetail,
    library: viewLibrary,
    today: viewToday,
    food: viewFood,
    progress: viewProgress,
    settings: viewSettings
  };
  const keepScroll = root().scrollTop;
  root().innerHTML = (views[state.view] || viewSchedule)();
  root().scrollTop = keepScroll;

  if (state.view === "library") renderLibraryResults();
  mountMuscleMaps();
  updateTabBadges();
  renderLightbox();
}

// The "Berk | Wife" switch in the header: whose data the tabs show.
function renderPersonSwitch() {
  const el = document.getElementById("person-switch");
  if (!el) return;
  const hide = state.view === "settings";
  el.innerHTML = hide ? "" : Store.members().map((m) => {
    const mm = Store.member(m.uid);
    const live = Store.profile(m.uid).live;
    return `<button class="person-chip ${state.viewAs === m.uid ? "active" : ""}" style="--pc:${mm.color}"
      data-action="switch-person" data-uid="${m.uid}">${esc(mm.name)}${m.uid === Store.me ? "" : ""}${live ? ' <span class="live-dot" title="Working out now"></span>' : ""}</button>`;
  }).join("");
  document.body.style.setProperty("--person", Store.member(state.viewAs).color);
}

Actions["switch-person"] = (el) => {
  state.viewAs = el.dataset.uid;
  state.addingForDate = null;
  state.pendingAddExercise = null;
  state.showTemplatePicker = false;
  state.showFoodPicker = false;
  state.mealForm = null;
  state.showGoalForm = false;
  state.editingSessionDetails = false;
  if (state.view === "sessionDetail") state.view = "schedule";
  render();
};

Actions["switch-view"] = (el) => {
  state.view = el.dataset.view;
  state.openSessionId = null;
  state.libraryContext = null;
  state.pendingAddExercise = null;
  state.showTemplatePicker = false;
  state.showFoodPicker = false;
  state.foodQuery = "";
  state.mealForm = null;
  state.showMedForm = false;
  state.medFormEditingId = null;
  state.editingSessionDetails = false;
  state.showGoalForm = false;
  render();
  root().scrollTop = 0;
};

// ---------- event delegation ----------

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = Actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName === "FORM") return; // forms are handled on submit
  fn(el, e);
});

// ---------- formatting helpers ----------

function kgLabel(lbs) {
  const n = Number(lbs);
  if (!n) return "";
  return `${(n * LBS_TO_KG).toFixed(1)} kg`;
}
function weightLabel(lbs, handMode) {
  const n = Number(lbs);
  if (!n) return "";
  return `${n} lbs${handMode === "single" ? " (single hand)" : ""} · ${kgLabel(n)}`;
}
function bodyWeightLabel(kg) {
  if (kg == null || kg === "") return "—";
  return `${Number(kg)} kg <span class="dim">(${(Number(kg) / LBS_TO_KG).toFixed(1)} lb)</span>`;
}
function repsOptionsFor(exercise) {
  return (exercise && exercise.categoryType === "cardio") ? CARDIO_REPS_OPTIONS : REPS_OPTIONS;
}
function repsSelectHTML(id, exercise, selected, extraAttrs) {
  const options = repsOptionsFor(exercise).slice();
  if (selected && !options.includes(Number(selected))) options.push(Number(selected));
  options.sort((a, b) => a - b);
  const opts = options.map((r) => `<option value="${r}" ${Number(selected) === r ? "selected" : ""}>${r}</option>`).join("");
  return `<select ${id ? `id="${id}"` : ""} ${extraAttrs || ""}>${opts}</select>`;
}
function timeLimitLabel(min, sec) {
  const m = Number(min) || 0;
  const s = Number(sec) || 0;
  if (m === 0 && s === 0) return "";
  return `${m}:${String(s).padStart(2, "0")}`;
}
function exerciseLabel(row) {
  const parts = [`${row.targetSets || "?"} sets`, `${row.targetReps || "?"} reps`];
  if (row.targetWeightLbs) parts.push(weightLabel(row.targetWeightLbs, row.targetHandMode));
  const t = timeLimitLabel(row.targetTimeLimitMin, row.targetTimeLimitSec);
  if (t) parts.push(`${t} limit`);
  return parts.join(" · ");
}
function capitalize(s) { return String(s).replace(/\b\w/g, (c) => c.toUpperCase()); }
function formatDuration(ms) {
  const total = Math.round((ms || 0) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}
function formatTimestamp(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function shortDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function sessionDateLabel(session) {
  if (!session || !session.date) return "";
  return `${DAY_NAMES[weekdayIndex(session.date)]} · ${shortDate(session.date)}`;
}
function timeOptions(selected) {
  let opts = "";
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      opts += `<option value="${val}" ${val === selected ? "selected" : ""}>${minutesToLabel(h * 60 + m)}</option>`;
    }
  }
  return opts;
}
function locationBadge(loc) {
  const cls = loc === "gym" ? "badge-gym" : loc === "home" ? "badge-home" : "badge-both";
  return `<span class="badge ${cls}">${esc(loc || "—")}</span>`;
}
function categoryTypeBadge(categoryType) {
  if (!categoryType) return `<span class="badge badge-incomplete">uncategorized</span>`;
  return `<span class="badge badge-cat-${categoryType}">${categoryType}</span>`;
}
function mechanicBadge(mechanic) {
  if (!mechanic || mechanic === "n/a") return "";
  return `<span class="badge badge-mechanic-${mechanic}">${mechanic}</span>`;
}
function tierBadge(tier) {
  if (!tier) return "";
  const label = tier === "red" ? "high" : tier === "orange" ? "medium" : "low";
  return `<span class="badge badge-tier-${tier}">${label} intensity</span>`;
}
function personBadge(ownerUid) {
  const m = Store.member(ownerUid);
  return `<span class="badge badge-person" style="--pc:${m.color}">${esc(m.name)}</span>`;
}
function readOnlyBanner() {
  if (isMine()) return "";
  return `<div class="viewing-banner">Viewing ${esc(viewedName())}'s ${state.view === "food" ? "food log" : "data"} · read-only</div>`;
}

// ---------- week helpers ----------

function weekRange(offsetWeeks) {
  const monday = new Date(todayKey() + "T00:00:00");
  monday.setDate(monday.getDate() - todayIndex() + (Number(offsetWeeks) || 0) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday, mondayKey: dateKey(monday), sundayKey: dateKey(sunday) };
}
function getWeekDates(offsetWeeks) {
  const { monday } = weekRange(offsetWeeks);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
}

// Weeks older than the live-sync window are fetched once, on demand.
function ensureRangeLoaded(fromKey, toKey, cols) {
  if (!window.Cloud || fromKey >= Cloud.windowStart()) return true;
  const key = `${fromKey}_${toKey}_${cols.join(",")}`;
  if (state.loadingRanges[key] === "done") return true;
  if (!state.loadingRanges[key]) {
    state.loadingRanges[key] = "loading";
    Promise.all(cols.map((c) => Cloud.loadRange(c, fromKey, toKey)))
      .then(() => { state.loadingRanges[key] = "done"; render(); })
      .catch(() => { delete state.loadingRanges[key]; showToast("Couldn't load that week. Are you online?", true); });
  }
  return false;
}

// ---------- images & lightbox ----------

function imagePath(rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${window.APP_CONFIG.IMAGE_BASE}${rel}`;
}
function exerciseImages(ex) { return (ex && ex.images) ? ex.images.filter(Boolean) : []; }
function imageGalleryHTML(ex) {
  const imgs = exerciseImages(ex);
  if (!imgs.length) return "";
  const attr = encodeURIComponent(JSON.stringify(imgs));
  return `<div class="image-gallery">${imgs.map((rel, i) => `<img src="${esc(imagePath(rel))}" loading="lazy" alt="${esc(ex.name)}" data-action="open-lightbox" data-images="${attr}" data-index="${i}">`).join("")}</div>`;
}
function thumbHTML(ex) {
  const imgs = exerciseImages(ex);
  if (!imgs.length) return `<div class="thumb-placeholder">no photo</div>`;
  const attr = encodeURIComponent(JSON.stringify(imgs));
  return `<img class="lib-thumb" src="${esc(imagePath(imgs[0]))}" loading="lazy" alt="${esc(ex.name)}" data-action="open-lightbox" data-images="${attr}" data-index="0">`;
}
function renderLightbox() {
  const lb = document.getElementById("lightbox-root");
  if (!lb) return;
  if (!state.lightbox) { lb.innerHTML = ""; return; }
  const { images, index, zoomed } = state.lightbox;
  lb.innerHTML = `
    <div class="lightbox-overlay">
      <div class="lightbox-scroll ${zoomed ? "zoomed" : ""}" data-action="toggle-lightbox-zoom">
        <img class="lightbox-img" src="${esc(imagePath(images[index]))}" alt="">
      </div>
      <button class="lightbox-close" data-action="close-lightbox" aria-label="Close">✕</button>
      ${images.length > 1 ? `
        <button class="lightbox-nav lightbox-prev" data-action="lightbox-prev" aria-label="Previous">‹</button>
        <button class="lightbox-nav lightbox-next" data-action="lightbox-next" aria-label="Next">›</button>
        <div class="lightbox-counter">${index + 1} / ${images.length}</div>` : ""}
      <div class="lightbox-hint">${zoomed ? "Tap to zoom out · scroll to pan" : "Tap image to zoom in"}</div>
    </div>`;
}
Actions["open-lightbox"] = (el, e) => {
  e.stopPropagation();
  let images = [];
  try { images = JSON.parse(decodeURIComponent(el.dataset.images)); } catch (err) { images = []; }
  if (!images.length) return;
  state.lightbox = { images, index: Number(el.dataset.index) || 0, zoomed: false };
  renderLightbox();
};
Actions["close-lightbox"] = () => { state.lightbox = null; renderLightbox(); };
Actions["toggle-lightbox-zoom"] = () => { if (state.lightbox) { state.lightbox.zoomed = !state.lightbox.zoomed; renderLightbox(); } };
Actions["lightbox-prev"] = () => {
  const lb = state.lightbox; if (!lb) return;
  lb.index = (lb.index - 1 + lb.images.length) % lb.images.length; lb.zoomed = false; renderLightbox();
};
Actions["lightbox-next"] = () => {
  const lb = state.lightbox; if (!lb) return;
  lb.index = (lb.index + 1) % lb.images.length; lb.zoomed = false; renderLightbox();
};

// ---------- intensity engine (unchanged rules from myHealth) ----------
// Base tier per exercise (primaryTier/secondaryTier), +1 tier for reps >= 15,
// +1 for sets >= 4, +1 for lifting more than last time. Stretching/cardio
// ("n/a" mechanic) always yellow. Muscles hit by several exercises take the max.

const TIER_ORDER = ["yellow", "orange", "red"];
function tierIndex(tier) { return TIER_ORDER.indexOf(tier); }
function tierAt(i) { return TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, i))]; }

function computeInstanceTier(ex, role, item, previousWeightLbs) {
  if (!ex) return "yellow";
  if (ex.mechanic === "n/a") return "yellow";
  const base = role === "primary" ? (ex.primaryTier || "orange") : (ex.secondaryTier || "yellow");
  let idx = tierIndex(base);
  if (idx === -1) idx = tierIndex("orange");
  const reps = Number(item && item.reps) || 0;
  const sets = Number(item && item.sets) || 0;
  const weight = Number(item && item.weightLbs) || 0;
  if (reps >= 15) idx += 1;
  if (sets >= 4) idx += 1;
  if (weight > 0 && previousWeightLbs && weight > Number(previousWeightLbs)) idx += 1;
  return tierAt(idx);
}
function computeMuscleTiers(rows) {
  const tiers = {};
  (rows || []).forEach((row) => {
    const ex = Library.byId(row.exerciseId);
    if (!ex) return;
    (ex.primaryMuscles || []).forEach((m) => {
      const t = computeInstanceTier(ex, "primary", row, row.previousWeightLbs);
      if (tiers[m] === undefined || tierIndex(t) > tierIndex(tiers[m])) tiers[m] = t;
    });
    (ex.secondaryMuscles || []).forEach((m) => {
      const t = computeInstanceTier(ex, "secondary", row, row.previousWeightLbs);
      if (tiers[m] === undefined || tierIndex(t) > tierIndex(tiers[m])) tiers[m] = t;
    });
  });
  return tiers;
}
function muscleTiersForPlannedRows(rows, owner) {
  return computeMuscleTiers((rows || []).map((row) => {
    const mem = Store.getExerciseMemory(row.exerciseId, owner);
    return {
      exerciseId: row.exerciseId, sets: row.targetSets, reps: row.targetReps,
      weightLbs: row.targetWeightLbs, previousWeightLbs: mem ? mem.weightLbs : null
    };
  }));
}
function tiersForHistoryEntry(h) {
  return computeMuscleTiers(((h && h.items) || []).filter((i) => i.done !== false));
}
function baseTiersForExercise(ex) {
  const tiers = {};
  (ex.primaryMuscles || []).forEach((m) => { tiers[m] = ex.primaryTier || "orange"; });
  (ex.secondaryMuscles || []).forEach((m) => {
    if (tiers[m] === undefined || tierIndex(ex.secondaryTier || "yellow") > tierIndex(tiers[m])) tiers[m] = ex.secondaryTier || "yellow";
  });
  return tiers;
}
function mergeTiers(list) {
  const merged = {};
  (list || []).forEach((tiers) => Object.entries(tiers || {}).forEach(([m, t]) => {
    if (merged[m] === undefined || tierIndex(t) > tierIndex(merged[m])) merged[m] = t;
  }));
  return merged;
}
function tierBadgeLine(tiers) {
  return TIER_ORDER.slice().reverse().map((tier) => {
    const names = Object.entries(tiers || {}).filter(([, t]) => t === tier).map(([m]) => capitalize(m));
    return names.length ? `<span class="badge badge-tier-${tier}">${names.join(", ")}</span>` : "";
  }).filter(Boolean).join(" ");
}
function muscleLegendHTML() {
  const M = window.MuscleMap || {};
  return `
    <div class="muscle-map-legend">
      <span><span class="swatch" style="background:${M.RED_COLOR || "#f87171"};"></span>High</span>
      <span><span class="swatch" style="background:${M.ORANGE_COLOR || "#fb923c"};"></span>Medium</span>
      <span><span class="swatch" style="background:${M.YELLOW_COLOR || "#fde047"};"></span>Low</span>
      <span><span class="swatch" style="background:#334155;"></span>Untrained</span>
    </div>`;
}
function muscleMapCardHTML(containerId, title) {
  return `<div class="card"><h3>${title}</h3><div id="${containerId}"></div>${muscleLegendHTML()}</div>`;
}

// Views register muscle maps to draw after their HTML is on the page:
// pendingMaps.push({ id: "element-id", tiers: {...}, size: "small" })
let pendingMaps = [];
function queueMuscleMap(id, tiers, size) { pendingMaps.push({ id, tiers, size }); }
function mountMuscleMaps() {
  const maps = pendingMaps;
  pendingMaps = [];
  if (!window.MuscleMap) return;
  maps.forEach(({ id, tiers, size }) => {
    const el = document.getElementById(id);
    if (el) MuscleMap.render({ container: el, muscleTiers: tiers, size: size || "normal" });
  });
}

// ---------- calories & nutrition ----------
//
// TARGETS (what to aim for each day):
//   BMR (Mifflin–St Jeor) × daily-life activity factor
//   + your planned workouts spread over the week
//     (workouts/week × typical minutes × MET 5 × body weight ÷ 7)
//   = maintenance calories, then −500 to lose / +300 to gain.
//   Protein = body weight (kg) × grams per kg (default 1.6).
//   Either target can be overridden by hand in Settings.
//
// DEFICIT (what actually happened that day):
//   BMR × daily-life factor + calories from workouts you really logged − eaten.

const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
const ACTIVITY_LABELS = {
  sedentary: "Sedentary (desk job, little movement)",
  light: "Light (some walking/standing)",
  moderate: "Moderate (on your feet a lot)",
  active: "Active (physical job)",
  veryActive: "Very active (very physical job)"
};
const GOAL_ADJUST = { lose: -500, maintain: 0, gain: 300 };
const GOAL_LABELS = { lose: "Lose weight (≈ −0.5 kg / −1 lb a week)", maintain: "Maintain", gain: "Gain / build muscle (slow)" };
const MET_BY_CATEGORY = {
  strength: 5.0, powerlifting: 6.0, "olympic weightlifting": 6.0, strongman: 6.0,
  plyometrics: 8.0, cardio: 7.0, stretching: 2.5
};
const DEFAULT_MET = 5.0;

function computeBMR(p, weightKg) {
  if (!(p && p.age && p.sex && p.heightCm && weightKg)) return null;
  const base = 10 * Number(weightKg) + 6.25 * Number(p.heightCm) - 5 * Number(p.age);
  return p.sex === "female" ? base - 161 : base + 5;
}
function baselineBurnForDate(dateStr, owner) {
  const p = Store.profile(owner);
  const bmr = computeBMR(p, Store.getWeightForDate(dateStr, owner));
  if (bmr == null) return null;
  return bmr * (ACTIVITY_MULTIPLIERS[p.activityLevel] || 1.2);
}
function nutritionTargets(owner, dateStr) {
  const p = Store.profile(owner);
  const w = Store.getWeightForDate(dateStr || todayKey(), owner);
  const bmr = computeBMR(p, w);
  if (bmr == null) {
    if (p.calorieTargetOverride || p.proteinTargetOverride) {
      return { calories: p.calorieTargetOverride || null, protein: p.proteinTargetOverride || null, manual: true };
    }
    return null;
  }
  const lifestyle = bmr * (ACTIVITY_MULTIPLIERS[p.activityLevel] || 1.2);
  const perWeek = Number(p.workoutsPerWeek) || 0;
  const minutes = Number(p.typicalWorkoutMin) || 60;
  const avgWorkoutBurn = (perWeek * (minutes / 60) * DEFAULT_MET * w) / 7;
  const maintenance = lifestyle + avgWorkoutBurn;
  const adjust = GOAL_ADJUST[p.goal || "maintain"] || 0;
  const floor = p.sex === "female" ? 1200 : 1500;
  const calculatedCalories = Math.max(Math.round((maintenance + adjust) / 10) * 10, floor);
  const perKg = Number(p.proteinPerKg) || 1.6;
  const calculatedProtein = Math.round(w * perKg);
  return {
    bmr: Math.round(bmr), lifestyle: Math.round(lifestyle), avgWorkoutBurn: Math.round(avgWorkoutBurn),
    maintenance: Math.round(maintenance), adjust, floorApplied: calculatedCalories === floor,
    calculatedCalories, calculatedProtein, perKg, weightKg: w,
    calories: Number(p.calorieTargetOverride) || calculatedCalories,
    protein: Number(p.proteinTargetOverride) || calculatedProtein,
    caloriesOverridden: !!p.calorieTargetOverride, proteinOverridden: !!p.proteinTargetOverride
  };
}
function effectiveDurationMs(h) {
  if (h.durationOverrideMin != null) return h.durationOverrideMin * 60000;
  if (h.startedAt && h.finishedAt) return Math.max(0, new Date(h.finishedAt) - new Date(h.startedAt));
  return 0;
}
function workoutCaloriesBurned(h, weightKg) {
  if (!weightKg) return 0;
  const hours = effectiveDurationMs(h) / 3600000;
  const done = (h.items || []).filter((i) => i.done);
  if (!done.length || !hours) return 0;
  const mets = done.map((i) => { const ex = Library.byId(i.exerciseId); return (ex && MET_BY_CATEGORY[ex.category]) || DEFAULT_MET; });
  return Math.round((mets.reduce((a, b) => a + b, 0) / mets.length) * Number(weightKg) * hours);
}
function foodTotals(dateStr, owner) {
  return Store.getFoodEntries(dateStr, owner).reduce((t, e) => {
    const q = e.quantity || 1;
    t.calories += (Number(e.calories) || 0) * q;
    t.protein += (Number(e.protein) || 0) * q;
    return t;
  }, { calories: 0, protein: 0 });
}
function daySummary(dateStr, owner) {
  const eaten = foodTotals(dateStr, owner);
  const baseline = baselineBurnForDate(dateStr, owner);
  const workoutBurn = Store.getHistory(owner).filter((h) => h.date === dateStr && !h.excluded)
    .reduce((s, h) => s + workoutCaloriesBurned(h, Store.getWeightForDate(h.date, owner)), 0);
  const burned = baseline != null ? baseline + workoutBurn : null;
  return {
    eaten, baseline, workoutBurn, burned,
    deficit: burned != null ? burned - eaten.calories : null,
    targets: nutritionTargets(owner, dateStr)
  };
}

// Progress bar like "1,450 / 2,100 kcal"
function meterHTML(label, value, target, unit, color) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = target && value > target;
  return `
    <div class="meter">
      <div class="row-between"><span class="meter-label">${label}</span>
        <span class="meter-value">${Math.round(value).toLocaleString()}${target ? ` <span class="dim">/ ${Math.round(target).toLocaleString()} ${unit}</span>` : ` ${unit}`}</span></div>
      <div class="progress-bar"><div class="fill" style="width:${pct}%;background:${over ? "var(--warn)" : color}"></div></div>
    </div>`;
}

// ---------- tab badges (meds due) ----------

function dueMedsCount() {
  const dateStr = todayKey();
  const idx = todayIndex();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let count = 0;
  Store.getMeds().forEach((med) => {
    if (!med.active || !(med.days || []).includes(idx)) return;
    (med.times || []).forEach((t) => { if (toMinutes(t) <= nowMin && !Store.isMedTaken(med, dateStr, t)) count++; });
  });
  return count;
}
function updateTabBadges() {
  const label = document.querySelector('.tab[data-view="today"] .tab-label');
  if (!label) return;
  let badge = label.querySelector(".tab-badge");
  const count = dueMedsCount();
  if (count > 0) {
    if (!badge) { badge = document.createElement("span"); badge.className = "tab-badge"; label.appendChild(badge); }
    badge.textContent = String(count);
  } else if (badge) badge.remove();
}

// ---------- file download helper (works on iPhone: opens the Share sheet) ----------

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- start-up ----------

async function init() {
  document.title = window.APP_CONFIG.APP_NAME;
  const t = document.getElementById("app-title");
  if (t) t.textContent = window.APP_CONFIG.APP_NAME;
  const fc = window.APP_CONFIG.FIREBASE_CONFIG || {};
  if (String(fc.apiKey || "").includes("PASTE") || Object.keys(window.APP_CONFIG.MEMBERS).some((k) => k.includes("PASTE"))) {
    renderAuthScreen("setup");
    return;
  }
  if (!App.signedIn && !document.body.classList.contains("auth-mode")) {
    root().innerHTML = `<div class="empty-state">Loading…</div>`;
    // If Firebase never answers (e.g. very first open with no internet).
    setTimeout(() => {
      if (!App.signedIn && !document.body.classList.contains("auth-mode")) {
        root().innerHTML = `<div class="empty-state">Can't reach the server.<br>Check your connection and reopen the app.</div>`;
      }
    }, 12000);
  }
  try {
    await Library.load();
  } catch (err) {
    console.error(err);
    showToast("Couldn't load the exercise list.", true);
  }
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
  }
  // Re-check "due" medication badges every minute.
  setInterval(() => { if (App.signedIn) updateTabBadges(); }, 60000);
  // Coming back to the app (e.g. next morning): refresh "today" everywhere.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && App.signedIn) App.scheduleRender(); });
  window.addEventListener("online", () => document.body.classList.remove("offline"));
  window.addEventListener("offline", () => document.body.classList.add("offline"));
  if (!navigator.onLine) document.body.classList.add("offline");
}

document.addEventListener("DOMContentLoaded", init);
