// Workout screens: Schedule, Session detail, Library, Today (incl. live session).
// Everything reads the person in state.viewAs. Editing controls only appear
// on your own data; on your partner's you get "copy to mine" buttons instead.

// ================= SCHEDULE =================

function sessionCompletedOnDate(sessionId, dateStr, owner) {
  return Store.getHistory(owner).some((h) => h.sessionId === sessionId && h.date === dateStr && !h.excluded);
}

function conflictsWithWork(owner, dateStr, startTime, duration) {
  const wh = Store.profile(owner).workHours;
  if (!wh || !wh.enabled) return false;
  if (weekdayIndex(dateStr) > 4) return false;
  const start = toMinutes(startTime);
  const end = start + Number(duration || 0);
  return start < toMinutes(wh.end) && end > toMinutes(wh.start);
}

function viewSchedule() {
  const owner = state.viewAs;
  const mine = isMine();
  const weekDates = getWeekDates(state.scheduleWeekOffset);
  const { mondayKey, sundayKey } = weekRange(state.scheduleWeekOffset);
  const loaded = ensureRangeLoaded(mondayKey, sundayKey, ["sessions", "history"]);
  const sessions = Store.getSessions(owner);
  const todayStr = todayKey();
  const off = state.scheduleWeekOffset;
  const title = off === 0 ? "This week" : off === 1 ? "Next week" : off === -1 ? "Last week" : "Week of " + shortDate(mondayKey);

  const days = DAY_NAMES.map((name, i) => {
    const dStr = dateKey(weekDates[i]);
    const daySessions = sessions.filter((s) => s.date === dStr).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    const isPastOrToday = dStr <= todayStr;
    const isToday = dStr === todayStr;

    const cards = daySessions.map((s) => {
      const conflict = conflictsWithWork(owner, s.date, s.startTime, s.duration);
      const endLabel = minutesToLabel(toMinutes(s.startTime) + Number(s.duration));
      const completed = sessionCompletedOnDate(s.id, dStr, owner);
      let completeToggle = "";
      if (isPastOrToday) {
        completeToggle = mine
          ? `<button class="badge ${completed ? "badge-home" : "badge-incomplete"}" data-action="toggle-session-complete" data-id="${s.id}" data-date="${dStr}">${completed ? "✓ Completed" : "Mark complete"}</button>`
          : `<span class="badge ${completed ? "badge-home" : "badge-incomplete"}">${completed ? "✓ Completed" : "Not done"}</span>`;
      }
      return `
        <div class="card session-card">
          <div class="tappable" data-action="open-session" data-id="${s.id}" style="flex:1;display:flex;justify-content:space-between;align-items:center;">
            <div class="session-meta">
              <div class="session-time">${minutesToLabel(toMinutes(s.startTime))} – ${endLabel}</div>
              <div class="session-sub">${s.title ? esc(s.title) + " · " : ""}${s.duration} min · ${(s.exercises || []).length} exercise${(s.exercises || []).length === 1 ? "" : "s"}${conflict ? " · ⚠️ overlaps work" : ""}</div>
            </div>
            <div class="stack" style="align-items:flex-end;">${locationBadge(s.location)}${completeToggle}</div>
          </div>
          ${mine
            ? `<button class="btn-icon" data-action="duplicate-session-next-week" data-id="${s.id}" title="Duplicate to next week">⧉</button>`
            : `<button class="btn-icon" data-action="copy-session-to-mine" data-id="${s.id}" title="Copy to my schedule">⇩</button>`}
        </div>`;
    }).join("");

    const addForm = mine && state.addingForDate === dStr ? `
      <form class="card" data-action="submit-session-form" data-date="${dStr}">
        <div class="form-field"><label>Name (optional)</label><input type="text" name="title" placeholder="e.g. Push day"></div>
        <div class="form-field"><label>Start time</label><select name="startTime">${timeOptions(Store.profile().defaultStartTime || "06:30")}</select></div>
        <div class="form-field"><label>Duration (minutes)</label><input type="number" name="duration" value="${Store.profile().typicalWorkoutMin || 60}" min="10" step="5" required></div>
        <div class="form-field"><label>Location</label>
          <select name="location"><option value="gym">Gym</option><option value="home">Home</option></select></div>
        <div class="row">
          <button type="submit" class="btn">Add workout</button>
          <button type="button" class="btn btn-secondary" data-action="cancel-add-form">Cancel</button>
        </div>
      </form>` : "";

    return `
      <section class="day-section ${isToday ? "is-today" : ""}">
        <div class="day-header">
          <div><span class="day-title">${name}${isToday ? " · Today" : ""}</span><span class="day-subtitle"> · ${shortDate(dStr)}</span></div>
          ${mine && state.addingForDate !== dStr ? `<button class="btn btn-secondary btn-sm" data-action="toggle-add-form" data-date="${dStr}">+ Add</button>` : ""}
        </div>
        ${cards || (state.addingForDate === dStr ? "" : `<div class="session-sub">No workout scheduled</div>`)}
        ${addForm}
      </section>`;
  }).join("");

  return `
    ${readOnlyBanner()}
    <div class="summary-header">
      <button class="btn-icon" data-action="schedule-week" data-dir="-1">‹</button>
      <h2>${title}</h2>
      <button class="btn-icon" data-action="schedule-week" data-dir="1">›</button>
    </div>
    <div class="summary-range">${shortDate(mondayKey)} – ${shortDate(sundayKey)} (Mon–Sun)${loaded ? "" : " · loading…"}</div>
    ${days}`;
}

Actions["toggle-add-form"] = (el) => { state.addingForDate = state.addingForDate === el.dataset.date ? null : el.dataset.date; render(); };
Actions["cancel-add-form"] = () => { state.addingForDate = null; render(); };
Actions["schedule-week"] = (el) => { state.scheduleWeekOffset += Number(el.dataset.dir); render(); };

function copySessionFields(src, date) {
  return {
    id: uid("session"), date, title: src.title || "",
    startTime: src.startTime, duration: src.duration, location: src.location,
    exercises: (src.exercises || []).map((r) => Object.assign({}, r, { id: uid("row") }))
  };
}

Actions["duplicate-session-next-week"] = (el) => {
  const src = Store.getSession(el.dataset.id);
  if (!src) return;
  Store.upsertSession(copySessionFields(src, addDays(src.date, 7)));
  showToast("Copied to next week");
  render();
};

Actions["copy-session-to-mine"] = (el) => {
  const src = Store.getSession(el.dataset.id);
  if (!src) return;
  const date = src.date < todayKey() ? todayKey() : src.date;
  const copy = copySessionFields(src, date);
  Store.upsertSession(copy);
  showToast(`Added to your schedule on ${shortDate(date)}`);
  state.viewAs = Store.me;
  state.view = "sessionDetail";
  state.openSessionId = copy.id;
  render();
};

Actions["open-session"] = (el) => {
  state.view = "sessionDetail";
  state.openSessionId = el.dataset.id;
  state.editingSessionDetails = false;
  state.showTemplatePicker = false;
  render();
  root().scrollTop = 0;
};

// Tapping "Mark complete" logs the plan as done (no live check-in needed).
// Tapping again excludes it from stats without deleting it; again re-includes.
Actions["toggle-session-complete"] = (el) => {
  const { id: sessionId, date: dateStr } = el.dataset;
  const existing = Store.getHistoryEntry(sessionId, dateStr);
  if (existing) {
    Store.updateHistory(existing.id, { excluded: !existing.excluded });
  } else {
    const session = Store.getSession(sessionId);
    if (!session) return;
    Store.addHistory({
      id: uid("hist"), sessionId, date: dateStr, title: session.title || "", location: session.location,
      startedAt: null, finishedAt: null, durationOverrideMin: session.duration, quickComplete: true,
      items: (session.exercises || []).map((row) => {
        const mem = Store.getExerciseMemory(row.exerciseId);
        return {
          exerciseId: row.exerciseId, sets: row.targetSets, reps: row.targetReps,
          weightLbs: row.targetWeightLbs, handMode: row.targetHandMode,
          previousWeightLbs: mem ? mem.weightLbs : null,
          timeLimitMin: row.targetTimeLimitMin || 0, timeLimitSec: row.targetTimeLimitSec || 0, done: true
        };
      })
    });
    Store.incrementCounts((session.exercises || []).map((r) => r.exerciseId));
  }
  render();
};

document.addEventListener("submit", (e) => {
  if (e.target.dataset.action !== "submit-session-form") return;
  e.preventDefault();
  const f = e.target;
  const session = {
    id: uid("session"),
    date: f.dataset.date,
    title: f.querySelector('[name="title"]').value.trim(),
    startTime: f.querySelector('[name="startTime"]').value,
    duration: Number(f.querySelector('[name="duration"]').value),
    location: f.querySelector('[name="location"]').value,
    exercises: []
  };
  Store.upsertSession(session);
  state.addingForDate = null;
  state.view = "sessionDetail";
  state.openSessionId = session.id;
  render();
  root().scrollTop = 0;
});

// ================= SESSION DETAIL =================

function viewSessionDetail() {
  const session = Store.getSession(state.openSessionId);
  if (!session) {
    return `<button class="back-link" data-action="switch-view" data-view="schedule">← Back</button>
      <div class="empty-state">Workout not found.</div>`;
  }
  const owner = session.ownerId;
  const mine = owner === Store.me;
  const exercises = session.exercises || [];
  const conflict = conflictsWithWork(owner, session.date, session.startTime, session.duration);
  const endLabel = minutesToLabel(toMinutes(session.startTime) + Number(session.duration));

  const rows = exercises.map((row, idx) => {
    const ex = Library.byId(row.exerciseId);
    const name = ex ? ex.name : row.exerciseId;
    const imgs = exerciseImages(ex);
    const thumb = imgs.length ? `<img class="ex-thumb" src="${esc(imagePath(imgs[0]))}" loading="lazy" alt="">` : "";
    const count = Store.getCount(row.exerciseId, owner);
    return `
      <div class="exercise-row">
        <div class="order-badge">${idx + 1}</div>
        ${thumb}
        <div class="info">
          <div class="ex-name">${esc(name)}</div>
          <div class="ex-target">${exerciseLabel(row)}${count > 0 ? ` · done ${count}×` : ""}</div>
          ${row.note ? `<div class="ex-target" style="font-style:italic;">${esc(row.note)}</div>` : ""}
        </div>
        ${mine ? `<div class="actions">
          <button class="btn-icon" data-action="move-exercise" data-id="${session.id}" data-row="${row.id}" data-dir="-1" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="btn-icon" data-action="move-exercise" data-id="${session.id}" data-row="${row.id}" data-dir="1" ${idx === exercises.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn-icon" data-action="remove-exercise" data-id="${session.id}" data-row="${row.id}">✕</button>
        </div>` : ""}
      </div>`;
  }).join("");

  // Load a saved workout: yours first, then your partner's.
  const templatePicker = mine && state.showTemplatePicker ? (() => {
    const groups = [Store.me, Store.partnerUid()].filter(Boolean).map((u) => {
      const list = Store.getTemplates(u);
      if (!list.length) return "";
      return `<div class="session-sub" style="margin:8px 0 6px;">${u === Store.me ? "Your workouts" : esc(Store.member(u).name) + "'s workouts"}</div>` +
        list.map((t) => `
          <div class="row-between" style="margin-bottom:10px;">
            <div><div style="font-weight:600;">${esc(t.name)}</div>
              <div class="session-sub">${(t.exercises || []).length} exercises</div></div>
            <button class="btn btn-sm" data-action="apply-template" data-id="${t.id}">Use</button>
          </div>`).join("");
    }).join("");
    return `<div class="card"><h3>Load a saved workout</h3>${groups || `<div class="empty-state">No saved workouts yet.</div>`}</div>`;
  })() : "";

  const editForm = mine && state.editingSessionDetails ? `
    <div class="card" style="margin-bottom:12px;">
      <div class="form-field"><label>Name</label><input id="edit-session-title" type="text" value="${esc(session.title || "")}"></div>
      <div class="form-field"><label>Date</label><input id="edit-session-date" type="date" value="${session.date}"></div>
      <div class="form-field"><label>Start time</label><select id="edit-session-start">${timeOptions(session.startTime)}</select></div>
      <div class="form-field"><label>Duration (minutes)</label><input id="edit-session-duration" type="number" min="10" step="5" value="${session.duration}"></div>
      <div class="form-field"><label>Location</label>
        <select id="edit-session-location">
          <option value="gym" ${session.location === "gym" ? "selected" : ""}>Gym</option>
          <option value="home" ${session.location === "home" ? "selected" : ""}>Home</option>
        </select></div>
      <div class="row">
        <button class="btn" data-action="save-session-edit" data-id="${session.id}">Save</button>
        <button class="btn btn-secondary" data-action="toggle-session-edit">Cancel</button>
      </div>
    </div>` : "";

  if (exercises.length) queueMuscleMap("session-muscle-map", muscleTiersForPlannedRows(exercises, owner));

  return `
    <button class="back-link" data-action="switch-view" data-view="schedule">← Back to schedule</button>
    ${mine ? "" : `<div class="viewing-banner">${esc(Store.member(owner).name)}'s workout · read-only</div>`}
    <h2>${session.title ? esc(session.title) + " · " : ""}${sessionDateLabel(session)} · ${minutesToLabel(toMinutes(session.startTime))}</h2>
    <div class="row-between" style="margin-bottom:12px;">
      <div class="row">${locationBadge(session.location)}<span class="session-sub">${session.duration} min · ends ${endLabel}</span></div>
      ${mine ? `<button class="btn-icon" data-action="toggle-session-edit" aria-label="Edit">✎</button>` : ""}
    </div>
    ${editForm}
    ${conflict ? `<div class="warning-banner">⚠️ This overlaps work hours. Kept it anyway — just flagging it.</div>` : ""}
    <h3>Exercises</h3>
    ${rows || `<div class="empty-state">No exercises yet.${mine ? " Add some from the library, or load a saved workout below." : ""}</div>`}
    ${exercises.length ? muscleMapCardHTML("session-muscle-map", "Muscles trained") : ""}
    ${mine ? `
      <div class="row" style="margin-top:10px;">
        <button class="btn" style="flex:1;" data-action="open-library-for-session" data-id="${session.id}">+ Add exercise</button>
        <button class="btn btn-secondary" style="flex:1;" data-action="toggle-template-picker">${state.showTemplatePicker ? "Hide saved" : "Load saved workout"}</button>
      </div>
      ${templatePicker}
      ${exercises.length ? `<button class="btn btn-secondary btn-block" data-action="save-template" data-id="${session.id}" style="margin-top:10px;">💾 Save as workout</button>` : ""}
      ${session.date === todayKey() && !Store.getLiveSession() && exercises.length ? `<button class="btn btn-block" data-action="start-session" data-id="${session.id}" style="margin-top:10px;">▶ Start this session</button>` : ""}
      <button class="btn btn-danger btn-block" data-action="delete-session" data-id="${session.id}" style="margin-top:20px;">Delete workout</button>
    ` : `
      <button class="btn btn-block" data-action="copy-session-to-mine" data-id="${session.id}" style="margin-top:10px;">⇩ Copy to my schedule</button>
      ${exercises.length ? `<button class="btn btn-secondary btn-block" data-action="save-template" data-id="${session.id}" style="margin-top:10px;">💾 Save to my workouts</button>` : ""}
    `}`;
}

Actions["toggle-session-edit"] = () => { state.editingSessionDetails = !state.editingSessionDetails; render(); };
Actions["save-session-edit"] = (el) => {
  const s = Store.getSession(el.dataset.id);
  if (!s) return;
  const duration = Number(document.getElementById("edit-session-duration").value);
  const date = document.getElementById("edit-session-date").value;
  if (!duration || duration < 5) { alert("Enter a valid duration."); return; }
  if (!date) { alert("Pick a date."); return; }
  Store.upsertSession(Object.assign({}, s, {
    title: document.getElementById("edit-session-title").value.trim(),
    date,
    startTime: document.getElementById("edit-session-start").value,
    duration,
    location: document.getElementById("edit-session-location").value
  }));
  state.editingSessionDetails = false;
  render();
};
Actions["delete-session"] = (el) => {
  if (!confirm("Delete this workout?")) return;
  Store.deleteSession(el.dataset.id);
  state.view = "schedule";
  state.openSessionId = null;
  render();
};
Actions["move-exercise"] = (el) => {
  const s = clone(Store.getSession(el.dataset.id));
  const idx = s.exercises.findIndex((r) => r.id === el.dataset.row);
  const j = idx + Number(el.dataset.dir);
  if (j < 0 || j >= s.exercises.length) return;
  [s.exercises[idx], s.exercises[j]] = [s.exercises[j], s.exercises[idx]];
  Store.upsertSession(s);
  render();
};
Actions["remove-exercise"] = (el) => {
  const s = clone(Store.getSession(el.dataset.id));
  s.exercises = s.exercises.filter((r) => r.id !== el.dataset.row);
  Store.upsertSession(s);
  render();
};
Actions["toggle-template-picker"] = () => { state.showTemplatePicker = !state.showTemplatePicker; render(); };
Actions["apply-template"] = (el) => {
  const t = Store.getTemplate(el.dataset.id);
  const s = Store.getSession(state.openSessionId);
  if (!t || !s) return;
  const copy = clone(s);
  copy.exercises = (copy.exercises || []).concat((t.exercises || []).map((r) => Object.assign({}, r, { id: uid("row") })));
  if (!copy.title) copy.title = t.name;
  Store.upsertSession(copy);
  state.showTemplatePicker = false;
  render();
};
Actions["save-template"] = (el) => {
  const s = Store.getSession(el.dataset.id);
  if (!s || !(s.exercises || []).length) return;
  const name = prompt("Name this workout (e.g. Push Day)", s.title || "");
  if (!name || !name.trim()) return;
  Store.saveTemplate({
    id: uid("tpl"), name: name.trim(), createdAt: new Date().toISOString(),
    exercises: s.exercises.map((r) => Object.assign({}, r, { id: uid("row") }))
  });
  showToast(`Saved "${name.trim()}" to your workouts`);
  render();
};
Actions["open-library-for-session"] = (el) => {
  state.libraryContext = el.dataset.id;
  state.view = "library";
  state.libraryMode = "exercises";
  state.libraryCategory = "all";
  render();
  root().scrollTop = 0;
};
Actions["finish-adding"] = () => {
  const sid = state.libraryContext;
  state.libraryContext = null;
  state.pendingAddExercise = null;
  state.view = "sessionDetail";
  state.openSessionId = sid;
  render();
};

// ================= LIBRARY =================

function viewLibrary() {
  const draftMode = !!state.draftWorkout;
  const adding = !!state.libraryContext || draftMode;
  const muscles = Array.from(new Set(Library.exercises.flatMap((e) => e.primaryMuscles || []))).sort();

  let banner = "";
  if (draftMode) {
    banner = `<div class="info-banner">
      Building a new saved workout (${state.draftWorkout.exercises.length} exercise${state.draftWorkout.exercises.length === 1 ? "" : "s"} so far).
      <div class="form-field" style="margin-top:8px;"><input id="draft-workout-name" type="text" placeholder="Name this workout…" value="${esc(state.draftWorkout.name || "")}"></div>
      <div class="row">
        <button class="btn btn-sm" data-action="save-draft-workout">Save workout</button>
        <button class="btn btn-secondary btn-sm" data-action="discard-draft-workout">Discard</button>
      </div></div>`;
  } else if (state.libraryContext) {
    const s = Store.getSession(state.libraryContext);
    if (s) banner = `<div class="info-banner">Adding exercises to your ${sessionDateLabel(s)} ${minutesToLabel(toMinutes(s.startTime))} workout (${(s.exercises || []).length} so far).
      <button class="btn btn-secondary btn-sm" data-action="finish-adding" style="margin-top:8px;">Done adding</button></div>`;
  }

  const modeToggle = adding ? "" : `
    <div class="wrap" style="margin-bottom:12px;">
      <button class="chip ${state.libraryMode === "exercises" ? "active" : ""}" data-action="set-lib-mode" data-mode="exercises">Exercises</button>
      <button class="chip ${state.libraryMode === "workouts" ? "active" : ""}" data-action="set-lib-mode" data-mode="workouts">${isMine() ? "My workouts" : esc(viewedName()) + "'s workouts"}</button>
    </div>`;

  if (!adding && state.libraryMode === "workouts") {
    return `<h2>Library</h2>${modeToggle}${workoutLibraryHTML()}`;
  }

  return `
    <h2>Exercise library</h2>
    ${modeToggle}
    ${banner}
    ${state.pendingAddExercise ? renderConfigurePanel() : ""}
    ${state.showAddExerciseForm ? addExerciseFormHTML() : ""}
    <div class="form-field">
      <input id="library-search" type="search" placeholder="Search ${Library.exercises.length} exercises…" value="${esc(state.libraryQuery)}">
    </div>
    <div class="wrap" style="margin-bottom:10px;">
      ${["all"].concat(CATEGORY_TYPES).map((cat) => `<button class="chip ${state.libraryCategory === cat ? "active" : ""}" data-action="set-lib-category" data-cat="${cat}">${cat}</button>`).join("")}
      <button class="chip ${state.libraryFavoritesOnly ? "active" : ""}" data-action="toggle-favorites-only">★ favorites</button>
    </div>
    <div class="wrap" style="margin-bottom:10px;">
      ${["all", "compound", "isolation"].map((m) => `<button class="chip ${state.libraryMechanic === m ? "active" : ""}" data-action="set-lib-mechanic" data-mech="${m}">${m}</button>`).join("")}
    </div>
    <div class="form-field">
      <select id="muscle-filter">
        <option value="all">All muscle groups</option>
        ${muscles.map((m) => `<option value="${m}" ${state.libraryMuscle === m ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    </div>
    ${adding ? "" : `<button class="btn btn-secondary btn-block" style="margin-bottom:12px;" data-action="toggle-add-exercise-form">${state.showAddExerciseForm ? "Cancel" : "+ Add exercise to database"}</button>`}
    <div id="library-results"></div>`;
}

function workoutLibraryHTML() {
  const owner = state.viewAs;
  const mine = isMine();
  const templates = Store.getTemplates(owner);
  const rows = templates.map((t) => {
    if (mine && state.editingTemplateId === t.id) {
      return `
        <div class="lib-item"><div class="lib-text">
          <input id="rename-template-input" type="text" value="${esc(t.name)}" style="margin-bottom:6px;">
          <div class="row">
            <button class="btn btn-sm" data-action="confirm-rename-template" data-id="${t.id}">Save</button>
            <button class="btn btn-secondary btn-sm" data-action="cancel-rename-template">Cancel</button>
          </div></div></div>`;
    }
    const names = (t.exercises || []).map((r) => (Library.byId(r.exerciseId) || {}).name).filter(Boolean);
    return `
      <div class="lib-item" style="align-items:center;">
        <div class="lib-text">
          <div class="ex-name">${esc(t.name)}</div>
          <div class="ex-tags">${names.length} exercises${names.length ? " · " + esc(names.slice(0, 4).join(", ")) + (names.length > 4 ? "…" : "") : ""}</div>
        </div>
        <div class="stack">
          ${mine ? `
            <button class="btn-icon" data-action="start-rename-template" data-id="${t.id}" aria-label="Rename">✎</button>
            <button class="btn-icon" data-action="delete-template" data-id="${t.id}" aria-label="Delete">✕</button>`
          : `<button class="btn btn-sm" data-action="copy-template-to-mine" data-id="${t.id}">Copy to mine</button>`}
        </div>
      </div>`;
  }).join("");

  return `
    ${mine ? `<button class="btn btn-block" style="margin-bottom:14px;" data-action="new-workout-from-library">+ Build a new workout</button>` : readOnlyBanner()}
    ${rows || `<div class="empty-state">No saved workouts yet.${mine ? " Build one, or save one from a scheduled workout." : ""}</div>`}`;
}

function filteredExercises() {
  const q = state.libraryQuery.trim().toLowerCase();
  return Library.exercises.filter((e) => {
    if (state.libraryCategory !== "all" && e.categoryType !== state.libraryCategory) return false;
    if (state.libraryMechanic !== "all" && e.mechanic !== state.libraryMechanic) return false;
    if (state.libraryMuscle !== "all" && !(e.primaryMuscles || []).includes(state.libraryMuscle)) return false;
    if (state.libraryFavoritesOnly && !Store.isFavorite(e.id)) return false;
    if (q && !String(e.name).toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderLibraryResults() {
  const container = document.getElementById("library-results");
  if (!container) return;
  const adding = !!state.libraryContext || !!state.draftWorkout;
  const results = filteredExercises();
  const shown = results.slice(0, 50);
  container.innerHTML = shown.map((e) => {
    const tap = adding ? `data-action="start-add-exercise" data-id="${e.id}"` : `data-action="toggle-library-item" data-id="${e.id}"`;
    const expanded = !adding && state.expandedExercise === e.id;
    const fav = Store.isFavorite(e.id);
    const count = Store.getCount(e.id);
    if (expanded) queueMuscleMap("lib-muscle-map", baseTiersForExercise(e), "small");
    return `
      <div class="lib-item tappable" ${tap}>
        ${thumbHTML(e)}
        <div class="lib-text">
          <div class="ex-name">${esc(e.name)}</div>
          <div class="wrap" style="margin:2px 0 4px;">${categoryTypeBadge(e.categoryType)}${mechanicBadge(e.mechanic)}${tierBadge(e.primaryTier)}${e.custom ? personBadge(e.ownerId) : ""}</div>
          <div class="ex-tags">${esc(e.equipment || "no equipment")} · ${esc((e.primaryMuscles || []).join(", "))}${count > 0 ? ` · done ${count}×` : ""}</div>
          ${e.muscleNote ? `<div class="ex-tags" style="font-style:italic;">${esc(e.muscleNote)}</div>` : ""}
          ${expanded ? `${imageGalleryHTML(e)}<div id="lib-muscle-map"></div>
            <div class="instructions"><ol>${(e.instructions || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
            ${e.custom && e.ownerId === Store.me ? `<button class="btn btn-danger btn-sm" data-action="delete-custom-exercise" data-id="${e.id}">Delete this exercise</button>` : ""}` : ""}
        </div>
        <button class="btn-icon" data-action="toggle-favorite" data-id="${e.id}" aria-label="Favorite">${fav ? "★" : "☆"}</button>
      </div>`;
  }).join("")
    + (results.length > 50 ? `<div class="empty-state">Showing 50 of ${results.length} — refine your search to see more.</div>` : "")
    + (shown.length === 0 ? `<div class="empty-state">No exercises match.</div>` : "");
  mountMuscleMaps();
}

function renderConfigurePanel() {
  const ex = Library.byId(state.pendingAddExercise);
  if (!ex) return "";
  const mem = Store.getExerciseMemory(ex.id);
  const sets = mem ? mem.sets : 3;
  const reps = mem ? mem.reps : (ex.categoryType === "cardio" ? 1 : 10);
  const weightLbs = mem ? (mem.weightLbs || "") : "";
  const handMode = mem ? (mem.handMode || "both") : "both";
  const memTime = mem ? timeLimitLabel(mem.timeLimitMin, mem.timeLimitSec) : "";
  const count = Store.getCount(ex.id);
  queueMuscleMap("configure-muscle-map", baseTiersForExercise(ex), "small");
  return `
    <div class="card">
      <div class="row-between">
        <h3>${esc(ex.name)}</h3>
        <button class="btn-icon" data-action="toggle-favorite" data-id="${ex.id}" aria-label="Favorite">${Store.isFavorite(ex.id) ? "★" : "☆"}</button>
      </div>
      ${count > 0 ? `<div class="session-sub" style="margin-bottom:8px;">Done ${count} time${count === 1 ? "" : "s"} so far</div>` : ""}
      ${imageGalleryHTML(ex)}
      <div id="configure-muscle-map"></div>
      ${mem ? `<div class="session-sub" style="margin-bottom:8px;">Last time: ${mem.sets} × ${mem.reps}${mem.weightLbs ? " @ " + weightLabel(mem.weightLbs, mem.handMode) : ""}${memTime ? " · " + memTime + " limit" : ""}</div>` : ""}
      <div class="live-inputs">
        <div class="field"><label>Sets</label><input id="cfg-sets" type="number" min="1" value="${sets}"></div>
        <div class="field"><label>Reps</label>${repsSelectHTML("cfg-reps", ex, reps)}</div>
      </div>
      <div class="live-inputs">
        <div class="field"><label>Weight (lbs, optional)</label><input id="cfg-weight-lbs" type="number" min="0" step="0.5" value="${weightLbs}" placeholder="e.g. 135" data-weight-lbs-input="cfg-weight-kg"></div>
        <div class="field"><label>Hands</label>
          <select id="cfg-hand-mode">
            <option value="both" ${handMode === "both" ? "selected" : ""}>Both hands / total</option>
            <option value="single" ${handMode === "single" ? "selected" : ""}>Single hand</option>
          </select></div>
      </div>
      <div class="session-sub" style="margin:-4px 0 10px;">≈ <span id="cfg-weight-kg">${kgLabel(weightLbs) || "0.0 kg"}</span></div>
      <div class="form-field">
        <label>Time limit (optional — holds, planks, intervals)</label>
        <div class="time-limit-group">
          <div class="field narrow"><input id="cfg-time-min" type="number" min="0" value="${mem ? (mem.timeLimitMin || 0) : 0}"></div><div class="colon">min</div>
          <div class="field narrow"><input id="cfg-time-sec" type="number" min="0" max="59" value="${mem ? (mem.timeLimitSec || 0) : 0}"></div><div class="colon">sec</div>
        </div>
      </div>
      <div class="form-field"><label>Note (optional)</label><input id="cfg-note" type="text" placeholder="e.g. superset with next, slow eccentric"></div>
      <div class="row">
        <button class="btn" data-action="confirm-add-exercise">Add to workout</button>
        <button class="btn btn-secondary" data-action="cancel-add-exercise">Cancel</button>
      </div>
    </div>`;
}

function addExerciseFormHTML() {
  const boxes = (group) => MUSCLE_LIST.map((m) => `
    <label class="check-label"><input type="checkbox" name="${group}" value="${m}">${capitalize(m)}</label>`).join("");
  return `
    <form class="card" id="add-exercise-form">
      <h3>Add a new exercise</h3>
      <div class="session-sub" style="margin-bottom:10px;">Saved to the shared library — you'll both see it.</div>
      <div class="form-field"><label>Name</label><input id="new-ex-name" type="text" required placeholder="e.g. Cable Lateral Raise"></div>
      <div class="form-field"><label>Equipment</label>
        <select id="new-ex-equipment">${EQUIPMENT_OPTIONS.map((eq) => `<option value="${eq}">${eq}</option>`).join("")}</select></div>
      <div class="form-field"><label>Category</label>
        <select id="new-ex-category">${CATEGORY_TYPES.map((c) => `<option value="${c}" ${c === "weight" ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="form-field"><label>Compound or isolation</label>
        <select id="new-ex-mechanic"><option value="compound">Compound</option><option value="isolation">Isolation</option><option value="n/a">Stretch / cardio</option></select></div>
      <div class="form-field"><label>Primary muscle(s)</label><div class="check-box-list">${boxes("new-ex-primary")}</div></div>
      <div class="form-field"><label>Secondary muscle(s) (optional)</label><div class="check-box-list">${boxes("new-ex-secondary")}</div></div>
      <div class="form-field"><label>Muscle note (optional)</label><input id="new-ex-muscle-note" type="text" placeholder="e.g. targets rear delts"></div>
      <div class="form-field"><label>Instructions (one step per line)</label><textarea id="new-ex-instructions" rows="4"></textarea></div>
      <div class="form-field"><label>Image URLs (one per line)</label><textarea id="new-ex-images" rows="2" placeholder="https://..."></textarea></div>
      <div class="row">
        <button type="submit" class="btn">Save exercise</button>
        <button type="button" class="btn btn-secondary" data-action="toggle-add-exercise-form">Cancel</button>
      </div>
    </form>`;
}

document.addEventListener("submit", (e) => {
  if (e.target.id !== "add-exercise-form") return;
  e.preventDefault();
  const f = e.target;
  const name = document.getElementById("new-ex-name").value.trim();
  if (!name) return;
  const primaryMuscles = Array.from(f.querySelectorAll('input[name="new-ex-primary"]:checked')).map((c) => c.value);
  const secondaryMuscles = Array.from(f.querySelectorAll('input[name="new-ex-secondary"]:checked')).map((c) => c.value);
  if (!primaryMuscles.length) { alert("Pick at least one primary muscle."); return; }
  const mechanic = document.getElementById("new-ex-mechanic").value;
  const instructions = document.getElementById("new-ex-instructions").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const categoryType = document.getElementById("new-ex-category").value;
  Store.saveCustomExercise({
    id: uid("custom"), name,
    category: mechanic === "n/a" ? (categoryType === "cardio" ? "cardio" : "stretching") : "strength",
    equipment: document.getElementById("new-ex-equipment").value,
    categoryType, mechanic,
    primaryTier: mechanic === "isolation" ? "red" : mechanic === "compound" ? "orange" : "yellow",
    secondaryTier: "yellow", level: "intermediate",
    primaryMuscles, secondaryMuscles,
    muscleNote: document.getElementById("new-ex-muscle-note").value.trim() || null,
    instructions: instructions.length ? instructions : ["No instructions added yet."],
    location: "gym",
    images: document.getElementById("new-ex-images").value.split("\n").map((s) => s.trim()).filter(Boolean),
    custom: true, createdAt: new Date().toISOString()
  });
  state.showAddExerciseForm = false;
  state.libraryQuery = name;
  showToast("Exercise added to the shared library");
  render();
});

function guessCategoryType(equipment) {
  if (equipment === "machine") return "machine";
  if (["barbell", "dumbbell", "kettlebells", "cable", "bands", "e-z curl bar"].includes(equipment)) return "weight";
  return "mat";
}

Actions["set-lib-mode"] = (el) => { state.libraryMode = el.dataset.mode; render(); };
Actions["set-lib-category"] = (el) => { state.libraryCategory = el.dataset.cat; render(); };
Actions["set-lib-mechanic"] = (el) => { state.libraryMechanic = el.dataset.mech; render(); };
Actions["toggle-favorites-only"] = () => { state.libraryFavoritesOnly = !state.libraryFavoritesOnly; render(); };
Actions["toggle-add-exercise-form"] = () => { state.showAddExerciseForm = !state.showAddExerciseForm; render(); };
Actions["toggle-library-item"] = (el) => {
  state.expandedExercise = state.expandedExercise === el.dataset.id ? null : el.dataset.id;
  renderLibraryResults();
};
Actions["toggle-favorite"] = (el, e) => { e.stopPropagation(); Store.toggleFavorite(el.dataset.id); render(); };
Actions["delete-custom-exercise"] = (el, e) => {
  e.stopPropagation();
  if (!confirm("Delete this exercise from the shared library? Past workouts that used it will show its ID instead of its name.")) return;
  Store.deleteCustomExercise(el.dataset.id);
  state.expandedExercise = null;
  render();
};
Actions["start-add-exercise"] = (el, e) => {
  if (e.target.closest('[data-action="open-lightbox"]')) return;
  state.pendingAddExercise = el.dataset.id;
  render();
  root().scrollTop = 0;
};
Actions["cancel-add-exercise"] = () => { state.pendingAddExercise = null; render(); };
Actions["confirm-add-exercise"] = () => {
  const row = {
    id: uid("row"),
    exerciseId: state.pendingAddExercise,
    targetSets: Number(document.getElementById("cfg-sets").value) || 1,
    targetReps: Number(document.getElementById("cfg-reps").value) || 1,
    targetWeightLbs: Number(document.getElementById("cfg-weight-lbs").value) || 0,
    targetHandMode: document.getElementById("cfg-hand-mode").value,
    targetTimeLimitMin: Number(document.getElementById("cfg-time-min").value) || 0,
    targetTimeLimitSec: Number(document.getElementById("cfg-time-sec").value) || 0,
    note: document.getElementById("cfg-note").value.trim()
  };
  if (state.draftWorkout) {
    const nameEl = document.getElementById("draft-workout-name");
    if (nameEl) state.draftWorkout.name = nameEl.value;
    state.draftWorkout.exercises.push(row);
  } else {
    const s = Store.getSession(state.libraryContext);
    if (s) {
      const copy = clone(s);
      copy.exercises = (copy.exercises || []).concat([row]);
      Store.upsertSession(copy);
    }
  }
  const name = (Library.byId(row.exerciseId) || {}).name;
  state.pendingAddExercise = null;
  showToast(`Added ${name || "exercise"}`);
  render();
};
Actions["new-workout-from-library"] = () => {
  state.draftWorkout = { name: "", exercises: [] };
  state.libraryMode = "exercises";
  render();
};
Actions["save-draft-workout"] = () => {
  const name = (document.getElementById("draft-workout-name") || {}).value || "";
  if (!name.trim()) { alert("Give this workout a name first."); return; }
  if (!state.draftWorkout.exercises.length) { alert("Add at least one exercise first."); return; }
  Store.saveTemplate({ id: uid("tpl"), name: name.trim(), createdAt: new Date().toISOString(), exercises: state.draftWorkout.exercises });
  state.draftWorkout = null;
  state.pendingAddExercise = null;
  state.libraryMode = "workouts";
  render();
};
Actions["discard-draft-workout"] = () => {
  state.draftWorkout = null;
  state.pendingAddExercise = null;
  state.libraryMode = "workouts";
  render();
};
Actions["start-rename-template"] = (el) => { state.editingTemplateId = el.dataset.id; render(); };
Actions["cancel-rename-template"] = () => { state.editingTemplateId = null; render(); };
Actions["confirm-rename-template"] = (el) => {
  const name = document.getElementById("rename-template-input").value.trim();
  const t = Store.getTemplate(el.dataset.id);
  if (t && name) Store.saveTemplate(Object.assign({}, t, { name }));
  state.editingTemplateId = null;
  render();
};
Actions["delete-template"] = (el) => {
  if (!confirm("Delete this saved workout?")) return;
  Store.deleteTemplate(el.dataset.id);
  render();
};
Actions["copy-template-to-mine"] = (el) => {
  const t = Store.getTemplate(el.dataset.id);
  if (!t) return;
  Store.saveTemplate({
    id: uid("tpl"), name: t.name, createdAt: new Date().toISOString(), copiedFrom: t.ownerId,
    exercises: (t.exercises || []).map((r) => Object.assign({}, r, { id: uid("row") }))
  });
  showToast(`"${t.name}" copied to your workouts`);
};

// ================= TODAY =================

function viewToday() {
  const owner = state.viewAs;
  const mine = isMine();
  const todayStr = todayKey();
  const header = `<h2>Today · ${DAY_NAMES[todayIndex()]}, ${shortDate(todayStr)}</h2>`;

  let workoutPart = "";
  const live = mine ? Store.getLiveSession() : null;
  if (live) {
    workoutPart = viewLiveSession(live);
  } else {
    const partnerLive = !mine ? Store.profile(owner).live : null;
    const sessions = Store.getSessions(owner).filter((s) => s.date === todayStr)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    const cards = sessions.map((s) => {
      const done = sessionCompletedOnDate(s.id, todayStr, owner);
      return `
        <div class="card">
          <div class="row-between">
            <div class="session-meta tappable" data-action="open-session" data-id="${s.id}">
              <div class="session-time">${s.title ? esc(s.title) + " · " : ""}${minutesToLabel(toMinutes(s.startTime))}</div>
              <div class="session-sub">${(s.exercises || []).length} exercises · ${s.duration} min · ${esc(s.location)}</div>
            </div>
            ${done ? `<span class="badge badge-home">done</span>` : ""}
          </div>
          ${mine ? `<button class="btn btn-block" style="margin-top:10px;" data-action="start-session" data-id="${s.id}">${done ? "Do it again" : "▶ Start session"}</button>` : ""}
        </div>`;
    }).join("");
    workoutPart = (partnerLive ? partnerLiveCardHTML(owner, partnerLive) : "")
      + (cards || `<div class="card"><div class="session-sub">No workout scheduled today.${mine ? " Add one from the Schedule tab." : ""}</div></div>`);
  }

  return `
    ${readOnlyBanner()}
    ${header}
    ${mine ? medsSectionHTML() : ""}
    <h3>Workout</h3>
    ${workoutPart}
    ${nutritionCardHTML(owner, todayStr, true)}
    ${weightSectionHTML(owner)}`;
}

function partnerLiveCardHTML(owner, live) {
  const mins = Math.round((Date.now() - new Date(live.startedAt).getTime()) / 60000);
  const names = (live.exerciseIds || []).map((id) => (Library.byId(id) || {}).name).filter(Boolean);
  if (mins > 6 * 60) return "";
  return `
    <div class="card live-status">
      <div class="row-between"><b><span class="live-dot"></span> Working out now</b><span class="session-sub">${mins} min in</span></div>
      <div class="progress-bar" style="margin:10px 0 6px;"><div class="fill" style="width:${live.total ? Math.round(live.done / live.total * 100) : 0}%"></div></div>
      <div class="session-sub">${live.done} of ${live.total} exercises done${names.length ? " · " + esc(names.slice(0, 5).join(", ")) : ""}</div>
    </div>`;
}

function weightSectionHTML(owner) {
  const mine = owner === Store.me;
  const dateStr = todayKey();
  const todayEntry = Store.getWeightLog(owner).find((w) => w.date === dateStr);
  const current = Store.getWeightForDate(dateStr, owner);
  const log = Store.getWeightLog(owner);
  const first = log.length ? log[0] : null;
  const change = first && current != null && log.length > 1 ? (current - first.weightKg) : null;
  return `
    <h3 class="section-gap">Weight</h3>
    <div class="card">
      <div class="row-between">
        <div class="session-sub">${todayEntry ? "Logged today" : current != null ? "Last known" : "Not logged yet"}</div>
        <div class="summary-stat" style="font-size:22px;">${bodyWeightLabel(current)}</div>
      </div>
      ${change != null ? `<div class="session-sub" style="text-align:right;">${change > 0 ? "+" : ""}${change.toFixed(1)} kg since ${shortDate(first.date)}</div>` : ""}
      ${mine ? `
        <div class="row" style="margin-top:10px;">
          <input id="weight-input" type="number" min="1" step="0.1" placeholder="kg" style="flex:1;" value="${todayEntry ? todayEntry.weightKg : ""}">
          <select id="weight-unit" style="width:80px;"><option value="kg" ${Store.profile().weightUnit !== "lb" ? "selected" : ""}>kg</option><option value="lb" ${Store.profile().weightUnit === "lb" ? "selected" : ""}>lb</option></select>
          <button class="btn" data-action="log-weight">${todayEntry ? "Update" : "Log"}</button>
        </div>` : ""}
    </div>`;
}

Actions["log-weight"] = () => {
  let val = Number(document.getElementById("weight-input").value);
  const unit = document.getElementById("weight-unit").value;
  if (!val || val <= 0) { alert("Enter a valid weight."); return; }
  if (unit === "lb") val = Math.round(val * LBS_TO_KG * 10) / 10;
  if (Store.profile().weightUnit !== unit) Store.updateProfile({ weightUnit: unit });
  Store.upsertWeight(todayKey(), val);
  render();
};

// ---------- meds (only ever your own) ----------

function medsSectionHTML() {
  const meds = Store.getMeds();
  if (!meds.length) return "";
  const dateStr = todayKey();
  const idx = todayIndex();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const doses = [];
  meds.forEach((med) => {
    if (!med.active || !(med.days || []).includes(idx)) return;
    (med.times || []).forEach((t) => doses.push({ med, time: t, taken: Store.isMedTaken(med, dateStr, t), due: toMinutes(t) <= nowMin }));
  });
  doses.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  const rows = doses.length ? doses.map((d) => `
    <div class="live-row ${d.taken ? "done" : ""}" style="padding:10px 12px;margin-bottom:8px;">
      <div class="row-between">
        <div><div class="ex-name" style="margin-bottom:2px;">${esc(d.med.name)}</div>
          <div class="session-sub">${minutesToLabel(toMinutes(d.time))}${d.due && !d.taken ? " · due" : ""}</div></div>
        <button class="btn ${d.taken ? "btn-secondary" : ""} btn-sm" data-action="toggle-med-taken" data-med-id="${d.med.id}" data-time="${d.time}">${d.taken ? "Taken ✓" : "Mark taken"}</button>
      </div>
    </div>`).join("") : `<div class="session-sub">Nothing scheduled for today.</div>`;
  return `<h3>Medications & vitamins <span class="dim" style="font-weight:400;font-size:12px;">· only you see these</span></h3><div class="card">${rows}</div>`;
}
Actions["toggle-med-taken"] = (el) => { Store.toggleMedTaken(el.dataset.medId, todayKey(), el.dataset.time); render(); };

// ---------- live session ----------

function viewLiveSession(live) {
  const session = Store.getSession(live.sessionId);
  const total = live.items.length;
  const doneCount = live.items.filter((i) => i.done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const elapsed = Math.round((Date.now() - new Date(live.startedAt).getTime()) / 60000);

  const rows = live.items.map((item, idx) => {
    const ex = Library.byId(item.exerciseId);
    const kgId = `live-weight-kg-${idx}`;
    const prev = item.previousWeightLbs ? `<div class="session-sub" style="margin:-4px 0 8px;">Last time: ${weightLabel(item.previousWeightLbs, item.handMode)}</div>` : "";
    return `
      <div class="live-row ${item.done ? "done" : ""}">
        <div class="ex-name">${idx + 1}. ${esc(ex ? ex.name : item.exerciseId)}</div>
        ${item.note ? `<div class="session-sub" style="margin:-4px 0 8px;font-style:italic;">${esc(item.note)}</div>` : ""}
        ${item.done ? "" : imageGalleryHTML(ex)}
        <div class="live-inputs">
          <div class="field"><label>Sets</label><input type="number" min="1" value="${item.sets}" data-live-field="sets" data-index="${idx}"></div>
          <div class="field"><label>Reps</label>${repsSelectHTML("", ex, item.reps, `data-live-field="reps" data-index="${idx}"`)}</div>
        </div>
        <div class="live-inputs">
          <div class="field"><label>Weight (lbs)</label><input type="number" min="0" step="0.5" value="${item.weightLbs || ""}" data-live-field="weightLbs" data-index="${idx}" placeholder="optional" data-weight-lbs-input="${kgId}"></div>
          <div class="field"><label>Hands</label>
            <select data-live-field="handMode" data-index="${idx}">
              <option value="both" ${item.handMode !== "single" ? "selected" : ""}>Both / total</option>
              <option value="single" ${item.handMode === "single" ? "selected" : ""}>Single hand</option>
            </select></div>
        </div>
        <div class="session-sub" style="margin:-4px 0 10px;">≈ <span id="${kgId}">${kgLabel(item.weightLbs) || "0.0 kg"}</span></div>
        ${prev}
        <div class="form-field">
          <label>Time limit (optional)</label>
          <div class="time-limit-group">
            <div class="field narrow"><input type="number" min="0" value="${item.timeLimitMin || 0}" data-live-field="timeLimitMin" data-index="${idx}"></div><div class="colon">min</div>
            <div class="field narrow"><input type="number" min="0" max="59" value="${item.timeLimitSec || 0}" data-live-field="timeLimitSec" data-index="${idx}"></div><div class="colon">sec</div>
          </div>
        </div>
        <button class="btn ${item.done ? "btn-secondary" : ""} btn-block" data-action="toggle-live-done" data-index="${idx}">${item.done ? "Mark not done" : "Mark done ✓"}</button>
      </div>`;
  }).join("");

  if (total) queueMuscleMap("live-muscle-map", computeMuscleTiers(live.items));
  return `
    <div class="row-between"><b>${session && session.title ? esc(session.title) : "Workout"} · in progress</b><span class="session-sub">${elapsed} min</span></div>
    <div class="progress-bar" style="margin-top:8px;"><div class="fill" style="width:${pct}%"></div></div>
    <div class="session-sub" style="margin-bottom:14px;">${doneCount} of ${total} done</div>
    ${total ? muscleMapCardHTML("live-muscle-map", "Muscles worked") : ""}
    ${rows}
    <div class="row section-gap">
      <button class="btn btn-block" data-action="finish-session">Finish session</button>
      <button class="btn btn-danger" data-action="cancel-live">Cancel</button>
    </div>`;
}

function startLiveSession(sessionId) {
  const s = Store.getSession(sessionId);
  if (!s) return;
  const items = (s.exercises || []).map((row) => {
    const mem = Store.getExerciseMemory(row.exerciseId);
    return {
      exerciseId: row.exerciseId, note: row.note || "",
      targetSets: row.targetSets, targetReps: row.targetReps, targetWeightLbs: row.targetWeightLbs, targetHandMode: row.targetHandMode,
      sets: mem ? mem.sets : row.targetSets,
      reps: mem ? mem.reps : row.targetReps,
      weightLbs: mem ? mem.weightLbs : (row.targetWeightLbs || ""),
      handMode: mem ? (mem.handMode || "both") : (row.targetHandMode || "both"),
      previousWeightLbs: mem ? mem.weightLbs : null,
      timeLimitMin: mem ? (mem.timeLimitMin || 0) : (row.targetTimeLimitMin || 0),
      timeLimitSec: mem ? (mem.timeLimitSec || 0) : (row.targetTimeLimitSec || 0),
      done: false
    };
  });
  const live = { sessionId, startedAt: new Date().toISOString(), items };
  Store.setLiveSession(live);
  Store.publishLiveStatus(live);
  state.view = "today";
  render();
  root().scrollTop = 0;
}

const LONG_SESSION_MS = 4 * 60 * 60 * 1000;

function finishLiveSession() {
  const live = Store.getLiveSession();
  if (!live) return;
  const session = Store.getSession(live.sessionId);
  const rawMs = Math.max(0, Date.now() - new Date(live.startedAt).getTime());
  let durationOverrideMin = null;
  if (rawMs > LONG_SESSION_MS) {
    const answer = prompt(`This session shows ${(rawMs / 3600000).toFixed(1)} hours since you tapped Start — maybe the app was left open. Enter the minutes you actually trained, or leave blank to keep it.`, "");
    if (answer && Number(answer) > 0) durationOverrideMin = Number(answer);
  }
  const memory = {};
  live.items.forEach((i) => {
    memory[i.exerciseId] = {
      sets: i.sets, reps: i.reps, weightLbs: i.weightLbs, handMode: i.handMode,
      timeLimitMin: i.timeLimitMin || 0, timeLimitSec: i.timeLimitSec || 0, updatedAt: new Date().toISOString()
    };
  });
  Store.updateProfile({ memory, live: null });
  Store.incrementCounts(live.items.filter((i) => i.done).map((i) => i.exerciseId));
  Store.addHistory({
    id: uid("hist"), sessionId: live.sessionId, date: todayKey(),
    title: session ? (session.title || "") : "",
    location: session ? session.location : null,
    startedAt: live.startedAt, finishedAt: new Date().toISOString(), durationOverrideMin,
    items: live.items
  });
  Store.setLiveSession(null);
  showToast("Workout saved 💪");
  render();
}

Actions["start-session"] = (el) => {
  if (Store.getLiveSession() && !confirm("You already have a session in progress. Discard it and start this one?")) return;
  startLiveSession(el.dataset.id);
};
Actions["toggle-live-done"] = (el) => {
  const live = Store.getLiveSession();
  const i = Number(el.dataset.index);
  live.items[i].done = !live.items[i].done;
  Store.setLiveSession(live);
  Store.publishLiveStatus(live);
  render();
};
Actions["finish-session"] = () => finishLiveSession();
Actions["cancel-live"] = () => {
  if (!confirm("Discard this session's progress?")) return;
  Store.setLiveSession(null);
  Store.publishLiveStatus(null);
  render();
};

// Live-session inputs save on every keystroke (to this phone only).
function onLiveFieldInput(e) {
  if (e.target.dataset.weightLbsInput) {
    const span = document.getElementById(e.target.dataset.weightLbsInput);
    if (span) span.textContent = kgLabel(e.target.value) || "0.0 kg";
  }
  if (!e.target.dataset.liveField) return;
  const live = Store.getLiveSession();
  if (!live) return;
  const field = e.target.dataset.liveField;
  let val = e.target.value;
  if (["sets", "reps", "timeLimitMin", "timeLimitSec", "weightLbs"].includes(field)) val = Number(val) || 0;
  live.items[Number(e.target.dataset.index)][field] = val;
  Store.setLiveSession(live);
}
document.addEventListener("input", onLiveFieldInput);
document.addEventListener("change", (e) => {
  if (e.target.dataset.liveField) onLiveFieldInput(e);
  if (e.target.id === "muscle-filter") { state.libraryMuscle = e.target.value; renderLibraryResults(); }
  if (e.target.id === "new-ex-equipment") {
    const c = document.getElementById("new-ex-category");
    if (c) c.value = guessCategoryType(e.target.value);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "library-search") { state.libraryQuery = e.target.value; renderLibraryResults(); }
});
