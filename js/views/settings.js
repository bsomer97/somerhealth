// Settings: your profile (drives calorie & protein targets), medications,
// importing your old myHealth backup, exporting data, signing out.
// Settings always show YOUR data, regardless of the person switch.

function viewSettings() {
  const p = Store.profile();
  const me = Store.member(Store.me);
  const t = nutritionTargets(Store.me, todayKey());
  const wh = p.workHours || { enabled: false, start: "09:00", end: "17:00" };

  const targetBox = t && t.bmr ? `
    <div class="target-box">
      <div class="row-between"><span>Calorie target</span><b>${t.calories.toLocaleString()} kcal${t.caloriesOverridden ? " (manual)" : ""}</b></div>
      <div class="row-between"><span>Protein target</span><b>${t.protein} g${t.proteinOverridden ? " (manual)" : ""}</b></div>
      <details style="margin-top:8px;"><summary class="session-sub">How this is calculated</summary>
        <div class="session-sub calc-lines">
          Resting burn (BMR, Mifflin–St Jeor): ${t.bmr} kcal<br>
          × daily-life activity → ${t.lifestyle} kcal<br>
          + planned workouts (${p.workoutsPerWeek || 0}×/week, ${p.typicalWorkoutMin || 60} min) → +${t.avgWorkoutBurn} kcal/day<br>
          = maintenance ≈ ${t.maintenance} kcal<br>
          ${t.adjust ? `${t.adjust > 0 ? "+" : "−"}${Math.abs(t.adjust)} for your goal → ` : ""}${t.calculatedCalories} kcal${t.floorApplied ? " (raised to the safe minimum)" : ""}<br>
          Protein: ${t.weightKg} kg × ${t.perKg} g/kg = ${t.calculatedProtein} g
        </div></details>
    </div>` : `<div class="session-sub" style="margin:10px 0;">Fill in age, sex, height and weight to see your targets.</div>`;

  return `
    <h2>Settings</h2>
    <div class="card row-between">
      <div><div style="font-weight:700;color:${me.color};">${esc(me.name)}</div>
        <div class="session-sub">Signed in · synced with ${esc(Store.member(Store.partnerUid()).name)}</div></div>
      <button class="btn btn-secondary btn-sm" data-action="sign-out">Sign out</button>
    </div>

    <h3 class="section-gap">Profile & targets</h3>
    <div class="card">
      <div class="form-field"><label>Display name</label><input id="profile-name" type="text" value="${esc(p.displayName || me.name)}"></div>
      <div class="live-inputs">
        <div class="field"><label>Age</label><input id="profile-age" type="number" min="1" value="${p.age || ""}"></div>
        <div class="field"><label>Sex</label>
          <select id="profile-sex">
            <option value="" ${!p.sex ? "selected" : ""}>—</option>
            <option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option>
          </select></div>
      </div>
      <div class="live-inputs">
        <div class="field"><label>Height (cm)</label><input id="profile-height" type="number" min="1" value="${p.heightCm || ""}" placeholder="e.g. 175"></div>
        <div class="field"><label>Starting weight (kg)</label><input id="profile-weight" type="number" min="1" step="0.1" value="${p.weightKg || ""}"></div>
      </div>
      <div class="session-sub" style="margin:-4px 0 12px;">5 ft 6 in = 168 cm · 150 lb = 68 kg. Once you log weight on the Today tab, that's used instead.</div>
      <div class="live-inputs">
        <div class="field"><label>Workouts per week</label><input id="profile-wpw" type="number" min="0" max="14" value="${p.workoutsPerWeek != null ? p.workoutsPerWeek : ""}" placeholder="e.g. 4"></div>
        <div class="field"><label>Typical workout (min)</label><input id="profile-wmin" type="number" min="10" step="5" value="${p.typicalWorkoutMin || 60}"></div>
      </div>
      <div class="form-field"><label>Daily activity (outside workouts)</label>
        <select id="profile-activity">${Object.entries(ACTIVITY_LABELS).map(([v, l]) => `<option value="${v}" ${(p.activityLevel || "sedentary") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="form-field"><label>Goal</label>
        <select id="profile-goal">${Object.entries(GOAL_LABELS).map(([v, l]) => `<option value="${v}" ${(p.goal || "maintain") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="form-field"><label>Protein (grams per kg of body weight)</label>
        <select id="profile-protein-perkg">${[1.2, 1.4, 1.6, 1.8, 2.0, 2.2].map((v) => `<option value="${v}" ${(Number(p.proteinPerKg) || 1.6) === v ? "selected" : ""}>${v} g/kg${v === 1.6 ? " (default)" : ""}</option>`).join("")}</select></div>
      <details style="margin-bottom:12px;"><summary class="session-sub">Override targets manually (optional)</summary>
        <div class="live-inputs" style="margin-top:8px;">
          <div class="field"><label>Calories / day</label><input id="profile-cal-override" type="number" min="0" value="${p.calorieTargetOverride || ""}" placeholder="auto"></div>
          <div class="field"><label>Protein g / day</label><input id="profile-pro-override" type="number" min="0" value="${p.proteinTargetOverride || ""}" placeholder="auto"></div>
        </div></details>
      <details style="margin-bottom:12px;"><summary class="session-sub">Work hours (warn when a workout overlaps)</summary>
        <label class="check-label" style="margin-top:8px;"><input type="checkbox" id="profile-wh-enabled" ${wh.enabled ? "checked" : ""}> Warn me about weekday overlaps</label>
        <div class="live-inputs">
          <div class="field"><label>From</label><select id="profile-wh-start">${timeOptions(wh.start)}</select></div>
          <div class="field"><label>To</label><select id="profile-wh-end">${timeOptions(wh.end)}</select></div>
        </div></details>
      <button class="btn btn-block" data-action="save-profile">Save profile</button>
      ${targetBox}
      <div class="session-sub" style="margin-top:8px;">These are estimates to steer by, not medical advice.</div>
    </div>

    <h3 class="section-gap">Medications & vitamins</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">Private to you — your partner can't see these. Due doses show on the Today tab (in-app only, no push notifications).</div>
      ${medsListHTML()}
      <button class="btn btn-block" style="margin-top:10px;" data-action="toggle-med-form">${state.showMedForm ? "Cancel" : "+ Add medication/vitamin"}</button>
      ${state.showMedForm ? medFormHTML() : ""}
    </div>

    <h3 class="section-gap">Bring over your old myHealth data</h3>
    <div class="card">
      <div class="session-sub" style="margin-bottom:12px;">
        In the OLD app: Settings → Download backup. Then choose that file here. It copies your schedule, workout history,
        saved workouts, favorites, weights, meals, medications and custom exercises into your account. Safe to run twice — it won't duplicate.
      </div>
      <input type="file" id="import-file-input" accept=".json,application/json">
      <div id="import-status" class="session-sub" style="margin-top:8px;">${esc(state.importStatus)}</div>
    </div>

    <h3 class="section-gap">Your data</h3>
    <div class="card">
      <button class="btn btn-block" data-action="export-backup">Download my data (JSON)</button>
      ${Store.getLocal("lastBackup") ? `<div class="session-sub" style="margin-top:6px;">Last downloaded: ${formatTimestamp(Store.getLocal("lastBackup"))}</div>` : ""}
      <button class="btn btn-secondary btn-block" style="margin-top:10px;" data-action="export-analytics-csv">Download daily CSV (both of us)</button>
      <div class="session-sub" style="margin-top:8px;">Everything is stored in your Firebase database and synced to both phones. These downloads are an extra safety copy and for analysis in Excel / Sheets.</div>
    </div>

    <div class="session-sub" style="text-align:center;margin:24px 0 8px;">${esc(window.APP_CONFIG.APP_NAME)} · <a href="#" data-action="force-update">check for app update</a></div>`;
}

Actions["save-profile"] = () => {
  const num = (id) => { const v = document.getElementById(id).value; return v === "" ? null : Number(v); };
  const fields = {
    displayName: document.getElementById("profile-name").value.trim() || null,
    age: num("profile-age"),
    sex: document.getElementById("profile-sex").value || null,
    heightCm: num("profile-height"),
    weightKg: num("profile-weight"),
    workoutsPerWeek: num("profile-wpw"),
    typicalWorkoutMin: num("profile-wmin") || 60,
    activityLevel: document.getElementById("profile-activity").value,
    goal: document.getElementById("profile-goal").value,
    proteinPerKg: Number(document.getElementById("profile-protein-perkg").value),
    calorieTargetOverride: num("profile-cal-override"),
    proteinTargetOverride: num("profile-pro-override"),
    workHours: {
      enabled: document.getElementById("profile-wh-enabled").checked,
      start: document.getElementById("profile-wh-start").value,
      end: document.getElementById("profile-wh-end").value
    }
  };
  Store.updateProfile(fields);
  showToast("Profile saved");
  render();
};

Actions["force-update"] = async (el, e) => {
  e.preventDefault();
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.update()));
  }
  location.reload();
};

// ---------- medications ----------

function medDaysLabel(days) {
  if (!days || days.length === 7) return "Daily";
  if (!days.length) return "No days selected";
  return days.slice().sort().map((d) => DAY_SHORT[d]).join(", ");
}
function medsListHTML() {
  const meds = Store.getMeds();
  if (!meds.length) return `<div class="session-sub">None added yet.</div>`;
  return meds.map((m) => `
    <div class="exercise-row">
      <div class="info"><div class="ex-name">${esc(m.name)}</div>
        <div class="ex-target">${(m.times || []).map((t) => minutesToLabel(toMinutes(t))).join(", ")} · ${medDaysLabel(m.days)}</div></div>
      <div class="actions">
        <button class="btn-icon" data-action="edit-med" data-id="${m.id}">✎</button>
        <button class="btn-icon" data-action="delete-med" data-id="${m.id}">✕</button>
      </div>
    </div>`).join("");
}
function medFormHTML() {
  const editing = state.medFormEditingId ? Store.getMed(state.medFormEditingId) : null;
  return `
    <div class="card" style="margin-top:10px;">
      <div class="form-field"><label>Name</label><input id="med-name" type="text" placeholder="e.g. Vitamin D" value="${editing ? esc(editing.name) : ""}"></div>
      <div class="form-field"><label>Time(s)</label>
        ${state.medFormTimes.map((t, i) => `
          <div class="row" style="margin-bottom:6px;">
            <select class="med-time-select" data-index="${i}" style="flex:1;">${timeOptions(t)}</select>
            ${state.medFormTimes.length > 1 ? `<button class="btn-icon" data-action="remove-med-time" data-index="${i}">✕</button>` : ""}
          </div>`).join("")}
        <button class="btn btn-secondary btn-sm" data-action="add-med-time">+ Add another time</button></div>
      <div class="form-field"><label>Days</label>
        <div class="wrap">${DAY_SHORT.map((d, i) => `<button class="chip ${state.medFormDays.includes(i) ? "active" : ""}" data-action="toggle-med-day" data-day="${i}">${d}</button>`).join("")}</div></div>
      <div class="row">
        <button class="btn" data-action="save-med">Save</button>
        <button class="btn btn-secondary" data-action="toggle-med-form">Cancel</button>
      </div>
    </div>`;
}
function syncMedFormFromDom() {
  const nameEl = document.getElementById("med-name");
  state.medFormDraftName = nameEl ? nameEl.value : state.medFormDraftName;
  const selects = document.querySelectorAll(".med-time-select");
  if (selects.length) state.medFormTimes = Array.from(selects).map((s) => s.value);
}
function restoreMedName() {
  const nameEl = document.getElementById("med-name");
  if (nameEl && state.medFormDraftName != null) nameEl.value = state.medFormDraftName;
}
Actions["toggle-med-form"] = () => {
  state.showMedForm = !state.showMedForm;
  state.medFormEditingId = null;
  state.medFormTimes = ["08:00"];
  state.medFormDays = [0, 1, 2, 3, 4, 5, 6];
  state.medFormDraftName = null;
  render();
};
Actions["add-med-time"] = () => { syncMedFormFromDom(); state.medFormTimes.push("08:00"); render(); restoreMedName(); };
Actions["remove-med-time"] = (el) => { syncMedFormFromDom(); state.medFormTimes.splice(Number(el.dataset.index), 1); render(); restoreMedName(); };
Actions["toggle-med-day"] = (el) => {
  syncMedFormFromDom();
  const d = Number(el.dataset.day);
  state.medFormDays = state.medFormDays.includes(d) ? state.medFormDays.filter((x) => x !== d) : state.medFormDays.concat(d).sort((a, b) => a - b);
  render();
  restoreMedName();
};
Actions["edit-med"] = (el) => {
  const m = Store.getMed(el.dataset.id);
  if (!m) return;
  state.showMedForm = true;
  state.medFormEditingId = m.id;
  state.medFormTimes = (m.times || ["08:00"]).slice();
  state.medFormDays = (m.days || []).slice();
  state.medFormDraftName = null;
  render();
};
Actions["delete-med"] = (el) => { if (confirm("Delete this reminder?")) { Store.deleteMed(el.dataset.id); render(); } };
Actions["save-med"] = () => {
  const name = document.getElementById("med-name").value.trim();
  if (!name) { alert("Enter a name."); return; }
  if (!state.medFormDays.length) { alert("Select at least one day."); return; }
  const times = Array.from(document.querySelectorAll(".med-time-select")).map((s) => s.value);
  const existing = state.medFormEditingId ? Store.getMed(state.medFormEditingId) : null;
  Store.saveMed(Object.assign({}, existing || { id: uid("med"), createdAt: new Date().toISOString(), taken: {} },
    { name, times, days: state.medFormDays.slice(), active: true }));
  state.showMedForm = false;
  render();
};

// ---------- import the OLD app's backup file ----------

document.addEventListener("change", (e) => {
  if (e.target.id !== "import-file-input") return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let dump;
    try { dump = JSON.parse(reader.result); } catch (err) { setImportStatus("That file isn't valid JSON."); return; }
    if (!dump || !dump._meta || dump._meta.app !== "myBerk") { setImportStatus("That doesn't look like an old myHealth backup."); return; }
    importOldBackup(dump);
  };
  reader.readAsText(file);
  e.target.value = "";
});

function setImportStatus(msg) {
  state.importStatus = msg;
  const el = document.getElementById("import-status");
  if (el) el.textContent = msg;
}

async function importOldBackup(dump) {
  const me = Store.me;
  const writes = [];
  const add = (col, id, data) => writes.push({ col, id, data: clean(Object.assign({}, data, { ownerId: me })) });
  const arr = (x) => (Array.isArray(x) ? x : []);

  arr(dump.SESSIONS).filter((s) => s.date).forEach((s) => add("sessions", s.id, {
    date: s.date, title: s.title || "", startTime: s.startTime || "06:30", duration: Number(s.duration) || 60,
    location: s.location || "gym", exercises: arr(s.exercises)
  }));
  arr(dump.HISTORY).forEach((h) => add("history", h.id, Object.assign({}, h, { items: arr(h.items) })));
  arr(dump.TEMPLATES).forEach((t) => add("templates", t.id, { name: t.name, createdAt: t.createdAt || null, exercises: arr(t.exercises) }));
  arr(dump.CUSTOM_MEALS).forEach((m) => add("meals", m.id, { name: m.name, serving: "", calories: Number(m.calories) || 0, protein: 0, createdAt: m.createdAt || null }));
  arr(dump.FOODLOG).forEach((f) => add("foodLog", f.id, {
    date: f.date, mealId: f.source === "custom" ? f.foodId : null, name: f.name,
    calories: Number(f.caloriesPerServing) || 0, protein: 0, quantity: f.quantity || 1, createdAt: f.date + "T12:00:00"
  }));
  const weights = arr(dump.WEIGHTLOG).slice().sort((a, b) => a.date.localeCompare(b.date));
  weights.forEach((w) => add("bodyMetrics", `${me}_${w.date}`, { date: w.date, weightKg: w.weightKg }));
  const cutoff = addDays(todayKey(), -60);
  arr(dump.MEDS).forEach((m) => {
    const taken = {};
    arr(dump.MED_LOG).filter((l) => l.medId === m.id && l.date >= cutoff).forEach((l) => { taken[`${l.date}@${l.time}`] = true; });
    add("meds", m.id, { name: m.name, times: arr(m.times), days: arr(m.days), active: m.active !== false, createdAt: m.createdAt || null, taken });
  });
  arr(dump.CUSTOM_EXERCISES).forEach((x) => add("customExercises", x.id, Object.assign({}, x, { custom: true })));

  const old = dump.PROFILE || {};
  const profileFields = {
    memory: dump.MEMORY || {},
    counts: dump.COUNTS || {},
    favorites: arr(dump.FAVORITES)
  };
  ["age", "sex", "heightCm", "weightKg", "activityLevel"].forEach((k) => { if (old[k] != null && Store.profile()[k] == null) profileFields[k] = old[k]; });
  if (!Store.profile().workHours) profileFields.workHours = { enabled: true, start: "09:00", end: "17:00" };
  if (weights.length) profileFields.latestWeight = { date: weights[weights.length - 1].date, weightKg: weights[weights.length - 1].weightKg };

  const summary = `${writes.filter((w) => w.col === "sessions").length} scheduled workouts, ${writes.filter((w) => w.col === "history").length} completed workouts, ` +
    `${writes.filter((w) => w.col === "templates").length} saved workouts, ${weights.length} weights, ${writes.filter((w) => w.col === "foodLog").length} food entries, ` +
    `${writes.filter((w) => w.col === "meals").length} meals, ${writes.filter((w) => w.col === "meds").length} meds, ${writes.filter((w) => w.col === "customExercises").length} custom exercises`;
  if (!confirm(`Import into ${Store.member(me).name}'s account?\n\n${summary}\n\nOld meals come over without protein — you can edit them in the Food tab.`)) return;

  // Show it on screen right away; Firestore syncs in the background.
  writes.forEach((w) => DataCache.put(w.col, w.id, w.data));
  Store.updateProfile(profileFields);
  setImportStatus("Importing… keep the app open.");
  try {
    await window.Cloud.setMany(writes, (done, total) => setImportStatus(`Importing… ${done} / ${total}`));
    setImportStatus(`Done: ${summary}.`);
    showToast("Old data imported");
  } catch (err) {
    console.error(err);
    setImportStatus("Import stopped: " + (err.code || err.message) + ". You can run it again — nothing will be duplicated.");
  }
  render();
}

// ---------- exports ----------

Actions["export-backup"] = async () => {
  showToast("Gathering everything…");
  try {
    const cols = ["sessions", "history", "templates", "foodLog", "bodyMetrics", "goals", "meds"];
    const dump = { _meta: { app: "ourHealth", exportedAt: new Date().toISOString(), owner: Store.me, name: Store.member(Store.me).name }, profile: Store.profile() };
    for (const c of cols) dump[c] = await window.Cloud.loadAllMine(c);
    dump.meals = Store.getMeals().filter((m) => m.ownerId === Store.me);
    dump.customExercises = Store.getCustomExercises().filter((x) => x.ownerId === Store.me);
    downloadFile(`ourhealth-${Store.member(Store.me).name.toLowerCase()}-${todayKey()}.json`, JSON.stringify(dump, null, 2), "application/json");
    Store.setLocal("lastBackup", new Date().toISOString());
    render();
  } catch (err) {
    console.error(err);
    showToast("Couldn't export — are you online?", true);
  }
};

function csvEscape(v) {
  const s = String(v === undefined || v === null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Actions["export-analytics-csv"] = async () => {
  showToast("Building CSV…");
  try {
    // Load full history for both people (one-off read, not kept live).
    for (const c of ["history", "foodLog", "bodyMetrics"]) await window.Cloud.loadRange(c, "2000-01-01", todayKey());
  } catch (err) {
    showToast("Couldn't load full history — are you online?", true);
    return;
  }
  const headers = ["date", "person", "sessionsCompleted", "exercisesCompleted", "minutesTrained", "musclesTrained",
    "caloriesBurnedWorkout", "caloriesBurnedBaseline", "caloriesEaten", "proteinEaten", "calorieTarget", "proteinTarget", "weightKg", "estimatedDeficit"];
  const lines = [headers.join(",")];
  Store.members().forEach((m) => {
    const owner = m.uid;
    const dates = new Set([
      ...Store.getHistory(owner).map((h) => h.date),
      ...Store.allFoodEntries(owner).map((e) => e.date),
      ...Store.getWeightLog(owner).map((w) => w.date)
    ]);
    if (!dates.size) return;
    for (let d = Array.from(dates).sort()[0]; d <= todayKey(); d = addDays(d, 1)) {
      const hist = Store.getHistory(owner).filter((h) => h.date === d && !h.excluded);
      const muscles = new Set();
      let exDone = 0, minutes = 0, wBurn = 0;
      hist.forEach((h) => {
        minutes += Math.round(effectiveDurationMs(h) / 60000);
        wBurn += workoutCaloriesBurned(h, Store.getWeightForDate(h.date, owner));
        (h.items || []).forEach((i) => {
          if (!i.done) return;
          exDone++;
          const ex = Library.byId(i.exerciseId);
          if (ex) (ex.primaryMuscles || []).forEach((x) => muscles.add(x));
        });
      });
      const food = foodTotals(d, owner);
      const base = baselineBurnForDate(d, owner);
      const t = nutritionTargets(owner, d);
      const w = Store.getWeightForDate(d, owner);
      const row = {
        date: d, person: Store.member(owner).name, sessionsCompleted: hist.length, exercisesCompleted: exDone,
        minutesTrained: minutes, musclesTrained: Array.from(muscles).sort().join(";"),
        caloriesBurnedWorkout: Math.round(wBurn), caloriesBurnedBaseline: base != null ? Math.round(base) : "",
        caloriesEaten: Math.round(food.calories), proteinEaten: Math.round(food.protein),
        calorieTarget: t && t.calories ? t.calories : "", proteinTarget: t && t.protein ? t.protein : "",
        weightKg: w != null ? w : "", estimatedDeficit: base != null && food.calories > 0 ? Math.round(base + wBurn - food.calories) : ""
      };
      lines.push(headers.map((h) => csvEscape(row[h])).join(","));
    }
  });
  if (lines.length === 1) { alert("No data yet to export."); return; }
  downloadFile(`ourhealth-daily-${todayKey()}.csv`, lines.join("\n"), "text/csv");
};
