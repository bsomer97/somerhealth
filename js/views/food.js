// Food tab: daily log with calories + protein against each person's targets,
// and the SHARED meal library — a meal either of you saves shows up for both,
// and you can add anything your partner ate to your own day with one tap.

function currentFoodDate() { return state.foodDate || todayKey(); }

function nutritionCardHTML(owner, dateStr, onTodayTab) {
  const s = daySummary(dateStr, owner);
  const t = s.targets;
  const mine = owner === Store.me;
  const cal = s.eaten.calories;
  const pro = s.eaten.protein;
  let body = "";
  if (t) {
    const left = t.calories ? Math.round(t.calories - cal) : null;
    body = `
      ${meterHTML("Calories", cal, t.calories, "kcal", "var(--person)")}
      ${meterHTML("Protein", pro, t.protein, "g", "var(--accent-2)")}
      <div class="session-sub" style="margin-top:6px;">
        ${left != null ? (left >= 0 ? `${left.toLocaleString()} kcal left` : `${Math.abs(left).toLocaleString()} kcal over`) : ""}
        ${t.protein ? ` · ${Math.max(0, Math.round(t.protein - pro))} g protein to go` : ""}
      </div>`;
  } else {
    body = `
      ${meterHTML("Calories", cal, null, "kcal", "var(--person)")}
      ${meterHTML("Protein", pro, null, "g", "var(--accent-2)")}
      <div class="session-sub">${mine ? "Fill in your profile in Settings to get daily calorie & protein targets." : "No targets yet — profile not filled in."}</div>`;
  }
  const deficit = s.deficit != null ? `
    <div class="deficit-row">
      <div><div class="session-sub">Burned (est.)</div><b>${Math.round(s.burned).toLocaleString()}</b></div>
      <div><div class="session-sub">From workouts</div><b>${Math.round(s.workoutBurn).toLocaleString()}</b></div>
      <div><div class="session-sub">${s.deficit >= 0 ? "Deficit" : "Surplus"}</div><b style="color:${s.deficit >= 0 ? "var(--accent-2)" : "var(--danger)"}">${s.deficit >= 0 ? "−" : "+"}${Math.abs(Math.round(s.deficit)).toLocaleString()}</b></div>
    </div>` : "";
  return `
    <h3 class="section-gap">Nutrition${onTodayTab ? "" : ""}</h3>
    <div class="card">
      ${body}
      ${deficit}
      ${onTodayTab ? `<button class="btn btn-secondary btn-block" style="margin-top:10px;" data-action="switch-view" data-view="food">${mine ? "Log food →" : "See food log →"}</button>` : ""}
    </div>`;
}

function viewFood() {
  const owner = state.viewAs;
  const mine = isMine();
  const dateStr = currentFoodDate();
  const loaded = ensureRangeLoaded(dateStr, dateStr, ["foodLog", "history", "bodyMetrics"]);
  const entries = Store.getFoodEntries(dateStr, owner);
  const isToday = dateStr === todayKey();
  const dateTitle = isToday ? "Today" : dateStr === addDays(todayKey(), -1) ? "Yesterday"
    : new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  const entryRows = entries.map((e) => {
    const q = e.quantity || 1;
    return `
      <div class="exercise-row">
        <div class="info">
          <div class="ex-name">${esc(e.name)}${q !== 1 ? ` <span class="dim">× ${q}</span>` : ""}</div>
          <div class="ex-target">${Math.round(e.calories * q)} kcal · ${Math.round((e.protein || 0) * q)} g protein</div>
        </div>
        ${mine ? `<div class="actions">
          <button class="btn-icon" data-action="food-qty" data-id="${e.id}" data-dir="-1" ${q <= 0.5 ? "disabled" : ""}>−</button>
          <button class="btn-icon" data-action="food-qty" data-id="${e.id}" data-dir="1">+</button>
          <button class="btn-icon" data-action="remove-food-entry" data-id="${e.id}">✕</button>
        </div>` : `<button class="btn btn-sm" data-action="copy-food-to-mine" data-id="${e.id}">+ Mine</button>`}
      </div>`;
  }).join("");

  return `
    ${readOnlyBanner()}
    <div class="summary-header">
      <button class="btn-icon" data-action="food-day" data-dir="-1">‹</button>
      <h2>${dateTitle}</h2>
      <button class="btn-icon" data-action="food-day" data-dir="1" ${isToday ? "disabled" : ""}>›</button>
    </div>
    <div class="summary-range">${loaded ? "" : "loading…"}</div>
    ${nutritionCardHTML(owner, dateStr, false)}
    <h3 class="section-gap">${mine ? "What you ate" : `What ${esc(viewedName())} ate`}</h3>
    ${entryRows || `<div class="card"><div class="session-sub">Nothing logged ${isToday ? "yet today" : "this day"}.</div></div>`}
    ${mine ? foodPickerHTML(dateStr) : ""}
    ${mine && !state.showFoodPicker && !state.mealForm ? recentMealsHTML(dateStr) : ""}
    ${mealLibraryHTML()}`;
}

// Quick-add chips: the meals you've logged most recently.
function recentMealsHTML() {
  const seen = new Set();
  const recent = Store.allFoodEntries().slice()
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
    .filter((e) => e.mealId && Store.getMeal(e.mealId) && !seen.has(e.mealId) && seen.add(e.mealId))
    .slice(0, 8);
  if (!recent.length) return "";
  return `
    <div class="card"><div class="session-sub" style="margin-bottom:8px;">Quick add (recent)</div>
      <div class="wrap">${recent.map((e) => {
        const m = Store.getMeal(e.mealId);
        return `<button class="chip" data-action="log-meal" data-id="${m.id}">${esc(m.name)} · ${Math.round(m.calories)}</button>`;
      }).join("")}</div></div>`;
}

function foodPickerHTML(dateStr) {
  if (state.mealForm) return mealFormHTML();
  if (!state.showFoodPicker) {
    return `<div class="row" style="margin-top:10px;">
      <button class="btn" style="flex:1;" data-action="toggle-food-picker">+ Add food</button>
      <button class="btn btn-secondary" style="flex:1;" data-action="new-meal">+ New meal</button>
    </div>`;
  }
  return `
    <div class="card" style="margin-top:10px;">
      <div class="row-between" style="margin-bottom:8px;"><h3 style="margin:0;">Add to ${dateStr === todayKey() ? "today" : shortDate(dateStr)}</h3>
        <button class="btn-icon" data-action="toggle-food-picker">✕</button></div>
      <div class="form-field"><input id="food-search" type="search" placeholder="Search your shared meals…" value="${esc(state.foodQuery)}"></div>
      <div id="food-results">${mealResultsHTML()}</div>
      <button class="btn btn-secondary btn-block" style="margin-top:8px;" data-action="new-meal">+ Not there? Create a new meal</button>
    </div>`;
}

function mealResultsHTML() {
  const q = state.foodQuery.trim().toLowerCase();
  const meals = Store.getMeals().filter((m) => !q || String(m.name).toLowerCase().includes(q));
  if (!meals.length) return `<div class="session-sub" style="padding:10px 0;">${q ? "No meals match." : "The shared meal library is empty — create your first meal."}</div>`;
  return meals.slice(0, 60).map((m) => `
    <div class="lib-item tappable" data-action="log-meal" data-id="${m.id}">
      <div class="lib-text">
        <div class="ex-name">${esc(m.name)}</div>
        <div class="ex-tags">${m.serving ? esc(m.serving) + " · " : ""}${Math.round(m.calories)} kcal · ${Math.round(m.protein || 0)} g protein</div>
      </div>
      ${personBadge(m.ownerId)}
    </div>`).join("");
}

function mealFormHTML() {
  const f = state.mealForm;
  const editing = !!f.id;
  return `
    <form class="card" id="meal-form" style="margin-top:10px;">
      <h3>${editing ? "Edit meal" : "New meal"}</h3>
      <div class="form-field"><label>Name</label><input id="meal-name" type="text" required placeholder="e.g. Chicken rice bowl" value="${esc(f.name || "")}"></div>
      <div class="form-field"><label>Serving (optional)</label><input id="meal-serving" type="text" placeholder="e.g. 1 bowl, 200 g, 1 scoop" value="${esc(f.serving || "")}"></div>
      <div class="live-inputs">
        <div class="field"><label>Calories (kcal)</label><input id="meal-calories" type="number" min="0" step="1" required value="${f.calories != null ? f.calories : ""}"></div>
        <div class="field"><label>Protein (g)</label><input id="meal-protein" type="number" min="0" step="0.1" value="${f.protein != null ? f.protein : ""}"></div>
      </div>
      ${editing ? "" : `
        <label class="check-label"><input type="checkbox" id="meal-save" checked> Save to our shared meal library</label>
        <label class="check-label"><input type="checkbox" id="meal-log" checked> Add to ${currentFoodDate() === todayKey() ? "today" : shortDate(currentFoodDate())}</label>`}
      <div class="row" style="margin-top:10px;">
        <button type="submit" class="btn">${editing ? "Save changes" : "Save"}</button>
        <button type="button" class="btn btn-secondary" data-action="cancel-meal-form">Cancel</button>
      </div>
      ${editing ? `<div class="session-sub" style="margin-top:8px;">Changes apply to future logs only — past days keep the numbers they were logged with.</div>` : ""}
    </form>`;
}

function mealLibraryHTML() {
  const meals = Store.getMeals();
  if (!meals.length) return "";
  return `
    <details class="card section-gap">
      <summary><b>Shared meal library</b> <span class="dim">· ${meals.length} meals</span></summary>
      <div style="margin-top:10px;">
        ${meals.map((m) => `
          <div class="row-between meal-lib-row">
            <div><div style="font-weight:600;">${esc(m.name)}</div>
              <div class="session-sub">${m.serving ? esc(m.serving) + " · " : ""}${Math.round(m.calories)} kcal · ${Math.round(m.protein || 0)} g · added by ${esc(Store.member(m.ownerId).name)}</div></div>
            ${m.ownerId === Store.me ? `<div class="row">
              <button class="btn-icon" data-action="edit-meal" data-id="${m.id}">✎</button>
              <button class="btn-icon" data-action="delete-meal" data-id="${m.id}">✕</button></div>` : ""}
          </div>`).join("")}
      </div>
    </details>`;
}

Actions["food-day"] = (el) => {
  const next = addDays(currentFoodDate(), Number(el.dataset.dir));
  if (next > todayKey()) return;
  state.foodDate = next === todayKey() ? null : next; // null = "always today", even past midnight
  render();
};
Actions["toggle-food-picker"] = () => {
  state.showFoodPicker = !state.showFoodPicker;
  state.foodQuery = "";
  render();
  if (state.showFoodPicker) setTimeout(() => { const s = document.getElementById("food-search"); if (s) s.focus(); }, 50);
};
Actions["log-meal"] = (el) => {
  const m = Store.getMeal(el.dataset.id);
  if (!m) return;
  Store.logFood({ dateStr: currentFoodDate(), mealId: m.id, name: m.name, calories: m.calories, protein: m.protein, quantity: 1 });
  showToast(`Added ${m.name}`);
  state.showFoodPicker = false;
  state.foodQuery = "";
  render();
};
Actions["food-qty"] = (el) => {
  const e = DataCache.get("foodLog", el.dataset.id);
  if (!e) return;
  const q = e.quantity || 1;
  const step = q <= 1 && Number(el.dataset.dir) < 0 ? 0.5 : 1;
  Store.setFoodQuantity(e.id, q + Number(el.dataset.dir) * step);
  render();
};
Actions["remove-food-entry"] = (el) => { Store.removeFoodEntry(el.dataset.id); render(); };
Actions["copy-food-to-mine"] = (el) => {
  const e = DataCache.get("foodLog", el.dataset.id);
  if (!e) return;
  Store.logFood({ dateStr: currentFoodDate(), mealId: e.mealId, name: e.name, calories: e.calories, protein: e.protein, quantity: e.quantity || 1 });
  showToast(`Added ${e.name} to your ${currentFoodDate() === todayKey() ? "day" : shortDate(currentFoodDate())}`);
};
Actions["new-meal"] = () => {
  state.mealForm = { name: state.foodQuery || "", serving: "", calories: null, protein: null };
  state.showFoodPicker = false;
  render();
};
Actions["edit-meal"] = (el) => {
  const m = Store.getMeal(el.dataset.id);
  if (!m) return;
  state.mealForm = { id: m.id, name: m.name, serving: m.serving || "", calories: m.calories, protein: m.protein || 0 };
  render();
  root().scrollTop = 0;
};
Actions["cancel-meal-form"] = () => { state.mealForm = null; render(); };
Actions["delete-meal"] = (el) => {
  const m = Store.getMeal(el.dataset.id);
  if (!m || !confirm(`Remove "${m.name}" from the shared library? Days you already logged it on stay the same.`)) return;
  Store.deleteMeal(m.id);
  render();
};

document.addEventListener("submit", (e) => {
  if (e.target.id !== "meal-form") return;
  e.preventDefault();
  const name = document.getElementById("meal-name").value.trim();
  const calories = Number(document.getElementById("meal-calories").value);
  const protein = Number(document.getElementById("meal-protein").value) || 0;
  const serving = document.getElementById("meal-serving").value.trim();
  if (!name || !(calories >= 0) || document.getElementById("meal-calories").value === "") { alert("Enter a name and calories."); return; }
  const f = state.mealForm;
  if (f.id) {
    const m = Store.getMeal(f.id);
    Store.saveMeal(Object.assign({}, m, { name, serving, calories, protein, updatedAt: new Date().toISOString() }));
  } else {
    const save = document.getElementById("meal-save").checked;
    const log = document.getElementById("meal-log").checked;
    let mealId = null;
    if (save) {
      mealId = uid("meal");
      Store.saveMeal({ id: mealId, name, serving, calories, protein, createdAt: new Date().toISOString() });
    }
    if (log) Store.logFood({ dateStr: currentFoodDate(), mealId, name, calories, protein, quantity: 1 });
    showToast(save ? `Saved "${name}"${log ? " and added it" : ""}` : `Added ${name}`);
  }
  state.mealForm = null;
  render();
});

document.addEventListener("input", (e) => {
  if (e.target.id !== "food-search") return;
  state.foodQuery = e.target.value;
  const r = document.getElementById("food-results");
  if (r) r.innerHTML = mealResultsHTML();
});
