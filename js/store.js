// Data layer.
//
// Cache   = in-memory copy of everything Firestore has sent us (filled by cloud.js).
// Store   = the functions the app calls to read and write data. Reads come
//           from the Cache instantly; writes update the Cache right away
//           (so the screen updates immediately, even offline) and then hand
//           the write to Firestore to sync.
// Library = the static exercise database + both of your custom exercises.
//
// Every personal document carries `ownerId` — the Firebase user it belongs
// to. firestore.rules checks it so each of you can only change your own data.

// ---------- small helpers ----------

function uid(prefix) {
  return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// LOCAL calendar date as "YYYY-MM-DD". (The old app used toISOString(),
// which is UTC — after ~7pm Eastern it already counted as "tomorrow".)
function dateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function todayKey() { return dateKey(new Date()); }

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// Firestore rejects `undefined` values - strip them before writing.
function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Mon=0 .. Sun=6
function weekdayIndex(dateStr) {
  return (new Date(dateStr + "T00:00:00").getDay() + 6) % 7;
}
function todayIndex() { return weekdayIndex(todayKey()); }

// ---------- Cache (filled by cloud.js listeners) ----------

const COLLECTIONS = ["profiles", "sessions", "history", "templates", "meals", "foodLog",
  "bodyMetrics", "meds", "customExercises", "goals"];

const DataCache = {
  cols: {},
  firstDataArrived: false,

  reset() {
    COLLECTIONS.forEach((c) => { this.cols[c] = new Map(); });
    this.firstDataArrived = false;
  },

  applyChanges(col, changes) {
    const map = this.cols[col];
    if (!map) return;
    changes.forEach((c) => {
      if (c.type === "removed") map.delete(c.id);
      else map.set(c.id, Object.assign({ id: c.id }, c.data));
    });
    this.firstDataArrived = true;
    if (window.App) window.App.scheduleRender();
  },

  all(col) { return Array.from((this.cols[col] || new Map()).values()); },
  get(col, id) { return (this.cols[col] && this.cols[col].get(id)) || null; },

  // Local (optimistic) write: update the cache now, sync to Firestore after.
  put(col, id, data) {
    this.cols[col].set(id, Object.assign({ id }, data));
  },
  drop(col, id) { this.cols[col].delete(id); }
};
DataCache.reset();
window.DataCache = DataCache;

function writeDoc(col, id, data) {
  const body = clean(Object.assign({}, data));
  delete body.id;
  DataCache.put(col, id, body);
  window.Cloud && window.Cloud.set(col, id, body);
}

function deleteDocById(col, id) {
  DataCache.drop(col, id);
  window.Cloud && window.Cloud.remove(col, id);
}

// ---------- Store ----------

const Store = {
  me: null, // Firebase uid of whoever is signed in on this phone

  // --- people ---
  members() {
    return Object.entries(window.APP_CONFIG.MEMBERS).map(([id, m]) => Object.assign({ uid: id }, m));
  },
  member(id) {
    const m = window.APP_CONFIG.MEMBERS[id] || { name: "?", color: "#94a3b8" };
    const p = this.profile(id);
    return Object.assign({ uid: id }, m, p.displayName ? { name: p.displayName } : {});
  },
  partnerUid() {
    return Object.keys(window.APP_CONFIG.MEMBERS).find((id) => id !== this.me) || null;
  },

  // --- profile (one doc per person; also holds favorites, memory, counts) ---
  profile(owner) {
    return DataCache.get("profiles", owner || this.me) || {};
  },
  // Shallow-merges fields into MY profile. Nested maps (memory, counts) are
  // merged one level deep so updating one exercise doesn't wipe the others.
  updateProfile(fields) {
    const current = this.profile();
    const next = Object.assign({}, current, fields);
    ["memory", "counts"].forEach((k) => {
      if (fields[k]) next[k] = Object.assign({}, current[k] || {}, fields[k]);
    });
    delete next.id;
    DataCache.put("profiles", this.me, clean(next));
    window.Cloud && window.Cloud.merge("profiles", this.me, clean(fields));
  },

  // --- exercise memory / counts / favorites (per person) ---
  getExerciseMemory(exerciseId, owner) {
    const mem = this.profile(owner).memory || {};
    return mem[exerciseId] || null;
  },
  setExerciseMemory(exerciseId, data) {
    this.updateProfile({ memory: { [exerciseId]: Object.assign({}, data, { updatedAt: new Date().toISOString() }) } });
  },
  getCount(exerciseId, owner) {
    return (this.profile(owner).counts || {})[exerciseId] || 0;
  },
  incrementCounts(exerciseIds) {
    const counts = {};
    exerciseIds.forEach((id) => { counts[id] = (counts[id] || this.getCount(id)) + 1; });
    if (exerciseIds.length) this.updateProfile({ counts });
  },
  isFavorite(exerciseId) {
    return (this.profile().favorites || []).includes(exerciseId);
  },
  toggleFavorite(exerciseId) {
    let favs = (this.profile().favorites || []).slice();
    if (favs.includes(exerciseId)) favs = favs.filter((x) => x !== exerciseId);
    else favs.push(exerciseId);
    this.updateProfile({ favorites: favs });
  },

  // --- scheduled sessions ---
  getSessions(owner) {
    const o = owner || this.me;
    return DataCache.all("sessions").filter((s) => s.ownerId === o);
  },
  getSession(id) { return DataCache.get("sessions", id); },
  upsertSession(session) {
    writeDoc("sessions", session.id, Object.assign({}, session, { ownerId: this.me }));
    return session;
  },
  deleteSession(id) { deleteDocById("sessions", id); },

  // --- completed workouts ---
  getHistory(owner) {
    const o = owner || this.me;
    return DataCache.all("history").filter((h) => h.ownerId === o);
  },
  addHistory(entry) {
    writeDoc("history", entry.id, Object.assign({}, entry, { ownerId: this.me }));
  },
  updateHistory(id, patch) {
    const h = DataCache.get("history", id);
    if (!h || h.ownerId !== this.me) return;
    writeDoc("history", id, Object.assign({}, h, patch));
  },
  getHistoryEntry(sessionId, dateStr, owner) {
    return this.getHistory(owner).find((h) => h.sessionId === sessionId && h.date === dateStr) || null;
  },

  // --- in-progress session: kept on THIS phone (it changes every tap);
  //     a small status is mirrored to the profile so your partner sees it ---
  liveKey() { return `ourhealth_live_${this.me}`; },
  getLiveSession() {
    try { return JSON.parse(localStorage.getItem(this.liveKey()) || "null"); } catch (e) { return null; }
  },
  setLiveSession(live) {
    if (live === null) localStorage.removeItem(this.liveKey());
    else localStorage.setItem(this.liveKey(), JSON.stringify(live));
  },
  publishLiveStatus(live) {
    if (!live) { this.updateProfile({ live: null }); return; }
    this.updateProfile({
      live: {
        startedAt: live.startedAt,
        done: live.items.filter((i) => i.done).length,
        total: live.items.length,
        exerciseIds: live.items.map((i) => i.exerciseId)
      }
    });
  },

  // --- saved workout templates ---
  getTemplates(owner) {
    const o = owner || this.me;
    return DataCache.all("templates").filter((t) => t.ownerId === o)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },
  getTemplate(id) { return DataCache.get("templates", id); },
  saveTemplate(t) { writeDoc("templates", t.id, Object.assign({}, t, { ownerId: this.me })); },
  deleteTemplate(id) { deleteDocById("templates", id); },

  // --- shared meal library (both of you add to it, both can use it) ---
  getMeals() {
    return DataCache.all("meals").sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },
  getMeal(id) { return DataCache.get("meals", id); },
  saveMeal(meal) {
    const existing = DataCache.get("meals", meal.id);
    const ownerId = existing ? existing.ownerId : this.me;
    writeDoc("meals", meal.id, Object.assign({}, meal, { ownerId }));
  },
  deleteMeal(id) { deleteDocById("meals", id); },

  // --- food log ---
  getFoodEntries(dateStr, owner) {
    const o = owner || this.me;
    return DataCache.all("foodLog").filter((e) => e.ownerId === o && e.date === dateStr)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  },
  allFoodEntries(owner) {
    const o = owner || this.me;
    return DataCache.all("foodLog").filter((e) => e.ownerId === o);
  },
  // Logging the same meal twice on one day bumps its quantity instead of
  // adding a duplicate row. Calories/protein are COPIED into the entry, so
  // later edits to the meal never change past days.
  logFood({ dateStr, mealId, name, calories, protein, quantity }) {
    const q = Number(quantity) || 1;
    const existing = mealId ? this.getFoodEntries(dateStr).find((e) => e.mealId === mealId) : null;
    if (existing) {
      writeDoc("foodLog", existing.id, Object.assign({}, existing, { quantity: (existing.quantity || 1) + q }));
      return;
    }
    const id = uid("food");
    writeDoc("foodLog", id, {
      ownerId: this.me, date: dateStr, mealId: mealId || null, name,
      calories: Number(calories) || 0, protein: Number(protein) || 0,
      quantity: q, createdAt: new Date().toISOString()
    });
  },
  setFoodQuantity(id, quantity) {
    const e = DataCache.get("foodLog", id);
    if (!e) return;
    writeDoc("foodLog", id, Object.assign({}, e, { quantity: Math.max(0.25, quantity) }));
  },
  removeFoodEntry(id) { deleteDocById("foodLog", id); },

  // --- body weight (one doc per person per day; doc id makes it an upsert) ---
  getWeightLog(owner) {
    const o = owner || this.me;
    return DataCache.all("bodyMetrics").filter((w) => w.ownerId === o).sort((a, b) => a.date.localeCompare(b.date));
  },
  upsertWeight(dateStr, weightKg) {
    writeDoc("bodyMetrics", `${this.me}_${dateStr}`, { ownerId: this.me, date: dateStr, weightKg });
    const latest = this.profile().latestWeight;
    if (!latest || dateStr >= latest.date) this.updateProfile({ latestWeight: { date: dateStr, weightKg } });
  },
  removeWeight(id) { deleteDocById("bodyMetrics", id); },
  // Weight as it stood on a given date, so a past day's numbers never change
  // when newer weights get logged.
  getWeightForDate(dateStr, owner) {
    const o = owner || this.me;
    const prior = this.getWeightLog(o).filter((w) => w.date <= dateStr);
    if (prior.length) return prior[prior.length - 1].weightKg;
    const p = this.profile(o);
    if (p.latestWeight && p.latestWeight.date <= dateStr) return p.latestWeight.weightKg;
    return p.weightKg || null;
  },

  // --- goals ---
  getGoals(owner) {
    const o = owner || this.me;
    return DataCache.all("goals").filter((g) => g.ownerId === o)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  },
  saveGoal(g) { writeDoc("goals", g.id, Object.assign({}, g, { ownerId: this.me })); },
  deleteGoal(id) { deleteDocById("goals", id); },

  // --- medications (private: only ever loaded for the signed-in person) ---
  getMeds() { return DataCache.all("meds").filter((m) => m.ownerId === this.me); },
  getMed(id) { return DataCache.get("meds", id); },
  saveMed(med) { writeDoc("meds", med.id, Object.assign({}, med, { ownerId: this.me })); },
  deleteMed(id) { deleteDocById("meds", id); },
  isMedTaken(med, dateStr, time) {
    return !!(med && med.taken && med.taken[`${dateStr}@${time}`]);
  },
  // "Taken" marks live inside the med doc; marks older than 60 days are
  // pruned so the doc never grows without bound.
  toggleMedTaken(medId, dateStr, time) {
    const med = this.getMed(medId);
    if (!med) return;
    const cutoff = addDays(todayKey(), -60);
    const taken = {};
    Object.entries(med.taken || {}).forEach(([k, v]) => { if (k.slice(0, 10) >= cutoff) taken[k] = v; });
    const key = `${dateStr}@${time}`;
    if (taken[key]) delete taken[key];
    else taken[key] = true;
    this.saveMed(Object.assign({}, med, { taken }));
  },

  // --- custom exercises (shared between you) ---
  getCustomExercises() { return DataCache.all("customExercises"); },
  saveCustomExercise(ex) {
    const existing = DataCache.get("customExercises", ex.id);
    writeDoc("customExercises", ex.id, Object.assign({}, ex, { ownerId: existing ? existing.ownerId : this.me }));
  },
  deleteCustomExercise(id) { deleteDocById("customExercises", id); },

  // --- this-phone-only timestamps ---
  getLocal(key) { return localStorage.getItem(`ourhealth_${key}_${this.me}`); },
  setLocal(key, val) { localStorage.setItem(`ourhealth_${key}_${this.me}`, val); }
};

// ---------- exercise library ----------

const Library = {
  base: [],
  baseById: new Map(),
  loaded: false,
  async load() {
    if (this.loaded) return;
    const res = await fetch("data/exercises.json");
    this.base = await res.json();
    this.base.forEach((e) => this.baseById.set(e.id, e));
    this.loaded = true;
  },
  get exercises() {
    return this.base.concat(Store.getCustomExercises());
  },
  byId(id) {
    return this.baseById.get(id) || DataCache.get("customExercises", id) || null;
  }
};
