// Progress tab: the old weekly Summary (muscle map, sessions, deficit) for
// whoever is selected, a side-by-side "the two of you" card, and goals.

function weeklySummary(offsetWeeks, owner) {
  const { monday, sunday, mondayKey, sundayKey } = weekRange(offsetWeeks);
  const entries = Store.getHistory(owner).filter((h) => h.date >= mondayKey && h.date <= sundayKey && !h.excluded);
  let totalMs = 0, gymCount = 0, homeCount = 0;
  const sessionTiers = [];
  entries.forEach((h) => {
    totalMs += effectiveDurationMs(h);
    if (h.location === "gym") gymCount++; else if (h.location === "home") homeCount++;
    sessionTiers.push(tiersForHistoryEntry(h));
  });

  // Diet: the deficit only counts days where food was actually logged —
  // otherwise an un-logged day would look like a huge "deficit".
  const lastDay = sundayKey > todayKey() ? todayKey() : sundayKey;
  let eaten = 0, protein = 0, daysWithFood = 0, proteinHits = 0, calorieDays = 0, targetSum = 0;
  let loggedBurn = 0, loggedEaten = 0, profileMissing = false;
  for (let d = mondayKey; d <= lastDay; d = addDays(d, 1)) {
    const tot = foodTotals(d, owner);
    eaten += tot.calories;
    protein += tot.protein;
    if (tot.calories <= 0) continue;
    daysWithFood++;
    const day = daySummary(d, owner);
    if (day.burned == null) profileMissing = true;
    else { loggedBurn += day.burned; loggedEaten += tot.calories; }
    const t = day.targets;
    if (t) {
      calorieDays++;
      targetSum += t.calories || 0;
      if (t.protein && tot.protein >= t.protein) proteinHits++;
    }
  }
  const workoutBurn = entries.reduce((s, h) => s + workoutCaloriesBurned(h, Store.getWeightForDate(h.date, owner)), 0);
  const dietComplete = !profileMissing && baselineBurnForDate(lastDay, owner) != null;
  const deficit = dietComplete && daysWithFood ? loggedBurn - loggedEaten : null;
  return {
    monday, sunday, mondayKey, sundayKey, entries,
    sessionsCount: entries.length, gymCount, homeCount, totalMs,
    weeklyTiers: mergeTiers(sessionTiers),
    eaten, protein, daysWithFood, proteinHits, calorieDays, targetSum,
    workoutBurn, deficit, dietComplete,
    sessionEntries: entries.slice().sort((a, b) => String(b.date + (b.startedAt || "")).localeCompare(String(a.date + (a.startedAt || ""))))
  };
}

function viewProgress() {
  const owner = state.viewAs;
  const mine = isMine();
  const off = state.summaryWeekOffset;
  const range = weekRange(off);
  const loaded = ensureRangeLoaded(range.mondayKey, range.sundayKey, ["history", "foodLog", "bodyMetrics"]);
  const s = weeklySummary(off, owner);
  queueMuscleMap("weekly-muscle-map", s.weeklyTiers);

  const tierGroups = TIER_ORDER.slice().reverse().map((tier) => {
    const names = Object.entries(s.weeklyTiers).filter(([, t]) => t === tier).map(([m]) => capitalize(m)).sort();
    if (!names.length) return "";
    const label = tier === "red" ? "High intensity" : tier === "orange" ? "Medium intensity" : "Low intensity";
    return `<div class="summary-muscle-row" style="align-items:flex-start;">
      <div class="badge badge-tier-${tier}" style="flex-shrink:0;">${label}</div>
      <div class="ex-tags" style="flex:1;">${names.join(", ")}</div></div>`;
  }).join("");

  const sessionsList = s.sessionEntries.map((h) => {
    const label = new Date(h.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const tierLine = tierBadgeLine(tiersForHistoryEntry(h));
    const kcal = workoutCaloriesBurned(h, Store.getWeightForDate(h.date, owner));
    return `
      <div class="exercise-row" style="align-items:flex-start;">
        <div class="info">
          <div class="ex-name">${label}${h.title ? " · " + esc(h.title) : ""}${h.location ? " · " + esc(h.location) : ""}</div>
          <div class="ex-target">${formatDuration(effectiveDurationMs(h))}${h.durationOverrideMin != null && !h.quickComplete ? " (edited)" : ""} · ${(h.items || []).filter((i) => i.done).length} exercises${kcal ? ` · ~${kcal} kcal` : ""}</div>
          ${tierLine ? `<div class="wrap" style="margin-top:6px;">${tierLine}</div>` : ""}
        </div>
        ${mine ? `<button class="btn-icon" data-action="edit-session-duration" data-id="${h.id}" aria-label="Edit duration">✎</button>` : ""}
      </div>`;
  }).join("");

  const title = off === 0 ? "This week" : off === -1 ? "Last week" : "Week of " + shortDate(range.mondayKey);
  return `
    <div class="summary-header">
      <button class="btn-icon" data-action="summary-week" data-dir="-1">‹</button>
      <h2>${title}</h2>
      <button class="btn-icon" data-action="summary-week" data-dir="1" ${off >= 0 ? "disabled" : ""}>›</button>
    </div>
    <div class="summary-range">${shortDate(range.mondayKey)} – ${shortDate(range.sundayKey)}${loaded ? "" : " · loading…"}</div>

    ${togetherCardHTML(off)}

    <h3 class="section-gap"><span class="person-dot"></span>${esc(viewedName())}'s week</h3>
    <div class="wrap" style="margin-bottom:10px;">
      <div class="card summary-stat-card"><div class="summary-stat">${s.sessionsCount}</div>
        <div class="session-sub">${s.gymCount || s.homeCount ? `${s.gymCount} gym, ${s.homeCount} home` : "workouts"}</div></div>
      <div class="card summary-stat-card"><div class="summary-stat">${formatDuration(s.totalMs)}</div><div class="session-sub">time trained</div></div>
    </div>
    <div class="card"><div id="weekly-muscle-map"></div>${muscleLegendHTML()}</div>
    <div class="card">${tierGroups || `<div class="empty-state">No completed workouts this week yet.</div>`}</div>

    <h3 class="section-gap">Sessions</h3>
    <div class="card">${sessionsList || `<div class="empty-state">No sessions logged this week.</div>`}</div>

    <h3 class="section-gap">Diet & calorie deficit</h3>
    <div class="card">
      <div class="wrap" style="margin-bottom:12px;">
        <div class="summary-stat-card"><div class="summary-stat">${Math.round(s.eaten).toLocaleString()}</div><div class="session-sub">kcal eaten</div></div>
        <div class="summary-stat-card"><div class="summary-stat">${Math.round(s.protein)}</div><div class="session-sub">g protein</div></div>
        <div class="summary-stat-card"><div class="summary-stat">${Math.round(s.workoutBurn)}</div><div class="session-sub">kcal from workouts</div></div>
      </div>
      ${s.calorieDays ? `<div class="session-sub">Protein target hit on ${s.proteinHits} of ${s.calorieDays} logged day${s.calorieDays === 1 ? "" : "s"} · average ${Math.round(s.eaten / Math.max(1, s.daysWithFood))} kcal/day vs target ${Math.round(s.targetSum / s.calorieDays)}</div>` : ""}
      ${s.deficit != null ? `
        <div class="summary-stat" style="text-align:center;margin-top:12px;${s.deficit < 0 ? "color:var(--danger);" : ""}">${s.deficit >= 0 ? "−" : "+"}${Math.abs(Math.round(s.deficit)).toLocaleString()} kcal</div>
        <div class="session-sub" style="text-align:center;">${s.deficit >= 0 ? "estimated deficit" : "estimated surplus"} over ${s.daysWithFood} logged day${s.daysWithFood === 1 ? "" : "s"} (≈ ${(Math.abs(s.deficit) / 7700).toFixed(2)} kg)</div>
      ` : (!s.dietComplete ? `<div class="session-sub" style="margin-top:10px;">${mine ? "Add age, sex, height and weight in Settings" : "Profile isn't filled in yet"} to see the deficit.</div>` : "")}
    </div>

    ${goalsSectionHTML(owner)}`;
}

// Both of you side by side for the same week.
function togetherCardHTML(off) {
  const people = Store.members();
  const cols = people.map((m) => {
    const p = Store.member(m.uid);
    const s = weeklySummary(off, m.uid);
    const target = Number(Store.profile(m.uid).workoutsPerWeek) || 0;
    return `
      <div class="together-col" style="--pc:${p.color}">
        <div class="together-name">${esc(p.name)}</div>
        <div class="together-big">${s.sessionsCount}${target ? `<span class="dim">/${target}</span>` : ""}</div>
        <div class="session-sub">workouts</div>
        <div class="together-line">${formatDuration(s.totalMs)} trained</div>
        <div class="together-line">${s.daysWithFood ? `${Math.round(s.eaten / s.daysWithFood).toLocaleString()} kcal/day` : "no food logged"}</div>
        <div class="together-line">${s.calorieDays ? `protein ✓ ${s.proteinHits}/${s.calorieDays} days` : "&nbsp;"}</div>
        <div class="together-line">${s.deficit != null ? `${s.deficit >= 0 ? "−" : "+"}${Math.abs(Math.round(s.deficit)).toLocaleString()} kcal` : "&nbsp;"}</div>
      </div>`;
  }).join("");
  return `<div class="card together-card"><div class="session-sub" style="margin-bottom:8px;">The two of you</div><div class="together-grid">${cols}</div></div>`;
}

Actions["summary-week"] = (el) => { state.summaryWeekOffset = Math.min(0, state.summaryWeekOffset + Number(el.dataset.dir)); render(); };
Actions["edit-session-duration"] = (el) => {
  const h = DataCache.get("history", el.dataset.id);
  if (!h) return;
  const cur = Math.round(effectiveDurationMs(h) / 60000);
  const answer = prompt(`Minutes trained for this session (currently ${cur}):`, cur);
  if (answer === null) return;
  const mins = Number(answer);
  if (!mins || mins <= 0) { alert("Enter a valid number of minutes."); return; }
  Store.updateHistory(h.id, { durationOverrideMin: mins });
  render();
};

// ================= GOALS =================
// Types:
//   weeklySessions — "work out N times a week" (progress = this week's workouts)
//   weight         — "reach X kg" (progress from starting weight → current)
//   lift           — "lift X lbs on an exercise" (progress = best logged weight)
//   protein        — "hit protein target N days a week"
//   custom         — free text with a done checkbox

const GOAL_TYPES = {
  weeklySessions: "Workouts per week",
  weight: "Reach a body weight",
  lift: "Lift a weight on an exercise",
  protein: "Hit protein target N days/week",
  custom: "Something else"
};

function bestLiftLbs(owner, exerciseId) {
  let best = 0;
  Store.getHistory(owner).forEach((h) => (h.items || []).forEach((i) => {
    if (i.exerciseId === exerciseId && i.done && Number(i.weightLbs) > best) best = Number(i.weightLbs);
  }));
  const mem = Store.getExerciseMemory(exerciseId, owner);
  if (mem && Number(mem.weightLbs) > best) best = Number(mem.weightLbs);
  return best;
}

function goalProgress(g, owner) {
  if (g.type === "weeklySessions") {
    const n = weeklySummary(0, owner).sessionsCount;
    return { pct: Math.min(100, Math.round(n / g.target * 100)), text: `${n} of ${g.target} this week`, done: n >= g.target };
  }
  if (g.type === "protein") {
    const s = weeklySummary(0, owner);
    return { pct: Math.min(100, Math.round(s.proteinHits / g.target * 100)), text: `${s.proteinHits} of ${g.target} days this week`, done: s.proteinHits >= g.target };
  }
  if (g.type === "weight") {
    const cur = Store.getWeightForDate(todayKey(), owner);
    const start = g.startValue;
    if (cur == null || start == null || start === g.target) return { pct: 0, text: cur != null ? `Now ${cur} kg → ${g.target} kg` : "Log your weight to track this" };
    const pct = Math.max(0, Math.min(100, Math.round((start - cur) / (start - g.target) * 100)));
    const left = Math.abs(cur - g.target).toFixed(1);
    return { pct, text: `${start} → <b>${cur}</b> → ${g.target} kg · ${left} kg to go`, done: pct >= 100 };
  }
  if (g.type === "lift") {
    const best = bestLiftLbs(owner, g.exerciseId);
    return { pct: Math.min(100, Math.round(best / g.target * 100)), text: `Best so far ${best || 0} lbs of ${g.target} lbs`, done: best >= g.target };
  }
  return { pct: g.done ? 100 : 0, text: g.done ? "Done" : "In progress", done: !!g.done };
}

function goalsSectionHTML(owner) {
  const mine = owner === Store.me;
  const goals = Store.getGoals(owner);
  const rows = goals.map((g) => {
    const p = goalProgress(g, owner);
    const ex = g.exerciseId ? Library.byId(g.exerciseId) : null;
    const title = g.type === "lift" ? `${ex ? ex.name : "Exercise"}: ${g.target} lbs` : esc(g.title || GOAL_TYPES[g.type]);
    return `
      <div class="goal-row ${p.done ? "goal-done" : ""}">
        <div class="row-between">
          <div class="ex-name">${p.done ? "🏆 " : ""}${title}</div>
          ${mine ? `<div class="row">
            ${g.type === "custom" ? `<button class="btn-icon" data-action="toggle-goal-done" data-id="${g.id}">${g.done ? "↺" : "✓"}</button>` : ""}
            <button class="btn-icon" data-action="delete-goal" data-id="${g.id}">✕</button></div>` : ""}
        </div>
        <div class="progress-bar" style="margin:8px 0 4px;"><div class="fill" style="width:${p.pct}%;background:var(--person)"></div></div>
        <div class="session-sub">${p.text}</div>
      </div>`;
  }).join("");

  return `
    <h3 class="section-gap">Goals</h3>
    <div class="card">
      ${rows || `<div class="session-sub">No goals yet.</div>`}
      ${mine ? (state.showGoalForm ? goalFormHTML() : `<button class="btn btn-secondary btn-block" style="margin-top:10px;" data-action="toggle-goal-form">+ Add a goal</button>`) : ""}
    </div>`;
}

function goalFormHTML() {
  const t = state.goalFormType;
  let fields = "";
  if (t === "weeklySessions") fields = `<div class="form-field"><label>Workouts per week</label><input id="goal-target" type="number" min="1" max="14" value="${Store.profile().workoutsPerWeek || 4}"></div>`;
  else if (t === "protein") fields = `<div class="form-field"><label>Days per week</label><input id="goal-target" type="number" min="1" max="7" value="5"></div>`;
  else if (t === "weight") fields = `<div class="form-field"><label>Target weight (kg)</label><input id="goal-target" type="number" min="20" step="0.1"></div>
    <div class="session-sub" style="margin-bottom:10px;">Starts from your current weight: ${Store.getWeightForDate(todayKey()) || "— (log it on Today first)"} kg</div>`;
  else if (t === "lift") {
    const favs = (Store.profile().favorites || []).map((id) => Library.byId(id)).filter(Boolean);
    const recentIds = Object.keys(Store.profile().memory || {});
    const opts = Array.from(new Set(favs.map((e) => e.id).concat(recentIds))).map((id) => Library.byId(id)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    fields = `<div class="form-field"><label>Exercise (your favorites & ones you've done)</label>
      <select id="goal-exercise">${opts.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("") || `<option value="">Do or favorite an exercise first</option>`}</select></div>
      <div class="form-field"><label>Target weight (lbs)</label><input id="goal-target" type="number" min="1" step="0.5"></div>`;
  } else fields = `<div class="form-field"><label>Goal</label><input id="goal-title" type="text" placeholder="e.g. Run a 5K, 10 pull-ups"></div>`;
  return `
    <div style="margin-top:12px;">
      <div class="form-field"><label>Type</label>
        <select id="goal-type">${Object.entries(GOAL_TYPES).map(([k, v]) => `<option value="${k}" ${k === t ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      ${fields}
      <div class="row">
        <button class="btn" data-action="save-goal">Save goal</button>
        <button class="btn btn-secondary" data-action="toggle-goal-form">Cancel</button>
      </div>
    </div>`;
}

document.addEventListener("change", (e) => {
  if (e.target.id === "goal-type") { state.goalFormType = e.target.value; render(); }
});
Actions["toggle-goal-form"] = () => { state.showGoalForm = !state.showGoalForm; render(); };
Actions["save-goal"] = () => {
  const type = state.goalFormType;
  const g = { id: uid("goal"), type, createdAt: new Date().toISOString() };
  if (type === "custom") {
    g.title = document.getElementById("goal-title").value.trim();
    if (!g.title) { alert("Describe the goal."); return; }
    g.done = false;
  } else {
    g.target = Number(document.getElementById("goal-target").value);
    if (!g.target) { alert("Enter a target."); return; }
    if (type === "lift") {
      g.exerciseId = document.getElementById("goal-exercise").value;
      if (!g.exerciseId) { alert("Pick an exercise."); return; }
    }
    if (type === "weight") {
      g.startValue = Store.getWeightForDate(todayKey());
      if (g.startValue == null) { alert("Log your current weight on the Today tab first."); return; }
    }
  }
  Store.saveGoal(g);
  state.showGoalForm = false;
  render();
};
Actions["toggle-goal-done"] = (el) => {
  const g = DataCache.get("goals", el.dataset.id);
  if (g) Store.saveGoal(Object.assign({}, g, { done: !g.done }));
  render();
};
Actions["delete-goal"] = (el) => {
  if (!confirm("Delete this goal?")) return;
  Store.deleteGoal(el.dataset.id);
  render();
};
