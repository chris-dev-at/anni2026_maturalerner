/* =========================================================================
   Anni 2026 · Maturalerner
   Rein statische Lern-App. Aller Fortschritt liegt in localStorage,
   Export/Import ermöglicht den Wechsel zwischen Geräten.
   ========================================================================= */
"use strict";

/* -------------------------------------------------------------- Speicher */

const NS = "aml:";
const KEYS = {
  marks:    NS + "marks",
  excluded: NS + "excluded",
  progress: NS + "progress",
  groups:   NS + "groups",
  attempts: NS + "attempts",
  settings: NS + "settings",
  theme:    NS + "theme",
};
const ATTEMPT_CAP = 20000;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    toast("Speicher voll – bitte Daten exportieren und Statistik zurücksetzen.");
    return false;
  }
}

/* ------------------------------------------------------------ Zustand */

const state = {
  fragen: [],
  byId: {},
  themenbereiche: [],
  marks: {},      // qid -> ISO-Zeitstempel
  excluded: {},   // qid -> ISO-Zeitstempel
  progress: {},   // qid -> Serie (Schnellstart „Einmal alles durch")
  groups: [],
  attempts: [],
  settings: { first_try_abhaken: false, shuffle: true, hilfen: true },
  proFrage: {},   // qid -> {versuche, richtig, falsch}
  session: null,
  setupMode: "quiz",
  scopeSel: { scope: "alles", tb: null, themen: null, tags: new Set() },
  archivOpen: {},
};

/* ------------------------------------------------------------- Helfer */

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function nowIso() { return new Date().toISOString(); }

/* ---------------------------------------------------------------- Thema */

// Gespeichert wird "light", "dark" oder nichts (= wie am Gerät eingestellt).
// Das <head>-Skript setzt data-theme bereits vor dem ersten Rendern.

function themePref() {
  try { return localStorage.getItem(KEYS.theme) || "system"; } catch (e) { return "system"; }
}

function systemPrefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function applyTheme() {
  const pref = themePref();
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const btn = $("#theme-btn");
  if (btn) {
    btn.textContent = dark ? "☀️" : "🌙";
    btn.title = dark ? "Auf helles Thema wechseln" : "Auf dunkles Thema wechseln";
  }
  const sel = $("#set-theme");
  if (sel) sel.value = pref;
}

function setTheme(pref) {
  try {
    if (pref === "system") localStorage.removeItem(KEYS.theme);
    else localStorage.setItem(KEYS.theme, pref);
  } catch (e) { /* privates Fenster – Thema gilt dann nur für diese Sitzung */ }
  applyTheme();
}

// Der Knopf schaltet direkt zwischen hell und dunkel um,
// das Auswahlfeld unter „Daten" bietet zusätzlich „wie am Gerät".
function toggleTheme() {
  const darkNow = document.documentElement.getAttribute("data-theme") === "dark";
  setTheme(darkNow ? "light" : "dark");
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

function tbTitle(nr) {
  const tb = state.themenbereiche.find((t) => t.nr === nr);
  return tb ? tb.titel : "Themenbereich " + nr;
}

/* --------------------------------------------------------------- Start */

async function init() {
  state.marks    = load(KEYS.marks, {});
  state.excluded = load(KEYS.excluded, {});
  state.progress = load(KEYS.progress, {});
  state.groups   = load(KEYS.groups, []);
  state.attempts = load(KEYS.attempts, []);
  state.settings = Object.assign(state.settings, load(KEYS.settings, {}));

  try {
    const res = await fetch("data/questions.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.fragen = data.fragen || [];
    state.themenbereiche = data.themenbereiche || [];
  } catch (e) {
    $("#home-summary").textContent =
      "Die Fragen konnten nicht geladen werden. Bitte Seite neu laden.";
    return;
  }

  state.fragen.forEach((q) => { state.byId[q.id] = q; });
  recomputeProFrage();

  bindGlobal();
  applyTheme();
  renderHome();
  renderArchivFilters();
  syncSettingsUi();
}

function recomputeProFrage() {
  const pf = {};
  state.attempts.forEach((a) => {
    if (!pf[a.qid]) pf[a.qid] = { versuche: 0, richtig: 0, falsch: 0 };
    pf[a.qid].versuche++;
    if (a.correct) pf[a.qid].richtig++; else pf[a.qid].falsch++;
  });
  state.proFrage = pf;
}

/* ---------------------------------------------------------- Navigation */

function nav(view) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const target = $("#view-" + view);
  if (target) target.classList.add("active");

  $$(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "archiv") renderArchiv();
  if (view === "stats") renderStats();
  if (view === "daten") renderDaten();
}

function bindGlobal() {
  $$("[data-nav]").forEach((b) => b.addEventListener("click", () => nav(b.dataset.nav)));
  $$("[data-mode]").forEach((b) => b.addEventListener("click", () => onMode(b.dataset.mode)));

  $("#btn-end").addEventListener("click", endSession);
  $("#btn-start").addEventListener("click", () => startFromSetup(null));
  $$('input[name="scope"]').forEach((r) => r.addEventListener("change", onScopeChange));
  $("#anzahl").addEventListener("change", updateSetupCount);
  $("#weight-weak").addEventListener("change", updateSetupCount);
  $("#dg-ziel").addEventListener("change", updateSetupCount);

  $("#btn-group-create").addEventListener("click", createGroup);
  $("#group-name").addEventListener("keydown", (e) => { if (e.key === "Enter") createGroup(); });
  $("#btn-reset-quick").addEventListener("click", resetQuickProgress);

  $("#mark-btn").addEventListener("click", toggleMark);
  $("#skip-btn").addEventListener("click", excludeCurrent);

  $("#scratch-toggle").addEventListener("click", () => {
    const a = $("#scratch-area");
    const open = a.classList.toggle("hidden");
    $("#scratch-toggle").textContent = open ? "📝 Notizzettel öffnen" : "📝 Notizzettel schließen";
    if (!open) a.focus();
  });

  $("#archiv-search").addEventListener("input", renderArchiv);
  $("#archiv-tb").addEventListener("change", renderArchiv);
  $("#archiv-tag").addEventListener("change", renderArchiv);

  $("#btn-reset-stats").addEventListener("click", () => {
    if (!confirm("Wirklich die gesamte Statistik löschen? Markierungen und Fortschritt bleiben erhalten.")) return;
    state.attempts = [];
    save(KEYS.attempts, state.attempts);
    recomputeProFrage();
    renderStats();
    toast("Statistik zurückgesetzt");
  });
  $("#btn-train-weak").addEventListener("click", () => onMode("schwach"));

  $("#btn-export").addEventListener("click", exportData);
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", importData);
  $("#btn-wipe").addEventListener("click", wipeAll);

  $("#theme-btn").addEventListener("click", toggleTheme);
  $("#set-theme").addEventListener("change", (e) => setTheme(e.target.value));
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if (themePref() === "system") applyTheme(); };
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  $("#set-firsttry").addEventListener("change", (e) => setSetting("first_try_abhaken", e.target.checked));
  $("#set-shuffle").addEventListener("change", (e) => setSetting("shuffle", e.target.checked));
  $("#set-hilfen").addEventListener("change", (e) => setSetting("hilfen", e.target.checked));

  document.addEventListener("keydown", onKeydown);
}

function setSetting(key, val) {
  state.settings[key] = val;
  save(KEYS.settings, state.settings);
}

function syncSettingsUi() {
  $("#set-theme").value = themePref();
  $("#set-firsttry").checked = !!state.settings.first_try_abhaken;
  $("#set-shuffle").checked  = state.settings.shuffle !== false;
  $("#set-hilfen").checked   = state.settings.hilfen !== false;
  $("#dg-firsttry").checked  = !!state.settings.first_try_abhaken;
}

/* ------------------------------------------------------------ Startseite */

function renderHome() {
  const total = state.fragen.length;
  const aktiv = state.fragen.filter((q) => !state.excluded[q.id]).length;
  const tbAnz = state.themenbereiche.length;
  let txt = total + " Fragen · " + tbAnz + " Themenbereiche";
  if (aktiv !== total) txt += " · " + (total - aktiv) + " ausgeblendet";
  $("#home-summary").textContent = txt;

  const grid = $("#tb-grid");
  grid.textContent = "";
  state.themenbereiche.forEach((tb) => {
    const n = state.fragen.filter((q) => q.tb === tb.nr && !state.excluded[q.id]).length;
    const card = el("button", "tb-card");
    card.type = "button";
    card.appendChild(el("span", "tb-num", String(tb.nr)));
    const body = el("span", "tb-body");
    body.appendChild(el("span", "tb-name", tb.titel));
    body.appendChild(el("span", "tb-meta", n + " Fragen"));
    card.appendChild(body);
    card.addEventListener("click", () => {
      state.scopeSel = { scope: "tb", tb: tb.nr, themen: null, tags: new Set() };
      onMode("quiz", true);
    });
    grid.appendChild(card);
  });
}

/* ---------------------------------------------------------------- Setup */

const MODE_TITLES = {
  quiz:        "✅ Quiz – konfigurieren",
  karteikarte: "🗂️ Karteikarten – konfigurieren",
  durchgang:   "📋 Einmal alles durch – konfigurieren",
  schwach:     "🎯 Schwere Fragen – konfigurieren",
  pruefung:    "🎓 Prüfungsmodus – konfigurieren",
};

function onMode(mode, keepScope) {
  state.setupMode = mode;
  $("#setup-title").textContent = MODE_TITLES[mode] || "Konfigurieren";

  const isDg = mode === "durchgang";
  $("#durchgang-panel").classList.toggle("hidden", !isDg);
  $("#anzahl-row").classList.toggle("hidden", isDg);
  $("#btn-start").textContent = isDg ? "Schnellstart (ohne Gruppe) →" : "Los geht's →";

  if (mode === "schwach") $("#weight-weak").checked = true;

  if (mode === "pruefung") {
    startPruefung();
    return;
  }

  if (!keepScope) state.scopeSel = { scope: "alles", tb: null, themen: null, tags: new Set() };

  renderScopeControls();
  renderTagChips();
  if (isDg) renderGroups();
  updateSetupCount();
  nav("setup");
}

function renderScopeControls() {
  const sel = state.scopeSel;
  $$('input[name="scope"]').forEach((r) => { r.checked = r.value === sel.scope; });
  $("#scope-tb").classList.toggle("hidden", sel.scope !== "tb");
  $("#scope-themen").classList.toggle("hidden", sel.scope !== "themen");

  // Themenbereich-Chips
  const chips = $("#tb-chips");
  chips.textContent = "";
  state.themenbereiche.forEach((tb) => {
    const n = state.fragen.filter((q) => q.tb === tb.nr && !state.excluded[q.id]).length;
    const c = el("button", "chip" + (sel.tb === tb.nr ? " on" : ""), tb.nr + " · " + tb.titel + " (" + n + ")");
    c.type = "button";
    c.addEventListener("click", () => {
      state.scopeSel.tb = tb.nr;
      renderScopeControls();
      updateSetupCount();
    });
    chips.appendChild(c);
  });
  if (sel.scope === "tb" && sel.tb === null && state.themenbereiche.length) {
    state.scopeSel.tb = state.themenbereiche[0].nr;
    renderScopeControls();
    return;
  }

  // Themen-Checkboxen je Themenbereich
  const groups = $("#themen-groups");
  groups.textContent = "";
  if (sel.themen === null) sel.themen = new Set();

  state.themenbereiche.forEach((tb) => {
    const themen = [...new Set(
      state.fragen.filter((q) => q.tb === tb.nr && !state.excluded[q.id]).map((q) => q.thema)
    )].sort((a, b) => a.localeCompare(b, "de"));
    if (!themen.length) return;

    const wrap = el("div", "fach-group");
    const head = el("div", "fach-group-head");
    head.appendChild(el("strong", null, tb.nr + " · " + tb.titel));
    const toggle = el("button", "btn-ghost", "alle");
    toggle.type = "button";
    toggle.addEventListener("click", () => {
      const keys = themen.map((t) => tb.nr + "|" + t);
      const allOn = keys.every((k) => sel.themen.has(k));
      keys.forEach((k) => { if (allOn) sel.themen.delete(k); else sel.themen.add(k); });
      renderScopeControls();
      updateSetupCount();
    });
    head.appendChild(toggle);
    wrap.appendChild(head);

    const checks = el("div", "themen-checks");
    themen.forEach((t) => {
      const key = tb.nr + "|" + t;
      const n = state.fragen.filter((q) => q.tb === tb.nr && q.thema === t && !state.excluded[q.id]).length;
      const lab = el("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = sel.themen.has(key);
      cb.addEventListener("change", () => {
        if (cb.checked) sel.themen.add(key); else sel.themen.delete(key);
        updateSetupCount();
      });
      lab.appendChild(cb);
      lab.appendChild(el("span", null, t + " (" + n + ")"));
      checks.appendChild(lab);
    });
    wrap.appendChild(checks);
    groups.appendChild(wrap);
  });
}

function onScopeChange(e) {
  state.scopeSel.scope = e.target.value;
  renderScopeControls();
  updateSetupCount();
}

const TAGS = [
  { key: "mark",   label: "⭐ Markiert",           test: (q) => !!state.marks[q.id] },
  { key: "weak",   label: "Oft falsch",            test: (q) => (state.proFrage[q.id] || {}).falsch > 0 },
  { key: "unseen", label: "Noch nie beantwortet",  test: (q) => !state.proFrage[q.id] },
  { key: "rechnen",label: "Rechnen",               test: (q) => !!q.rechnen },
  { key: "grafik", label: "Grafik beschreiben",    test: (q) => !!q.grafik },
];

function renderTagChips() {
  const box = $("#tag-chips");
  box.textContent = "";
  let shown = 0;
  TAGS.forEach((t) => {
    const n = state.fragen.filter((q) => !state.excluded[q.id] && t.test(q)).length;
    if (!n) return;
    shown++;
    const c = el("button", "chip" + (state.scopeSel.tags.has(t.key) ? " on" : ""), t.label + " (" + n + ")");
    c.type = "button";
    c.addEventListener("click", () => {
      if (state.scopeSel.tags.has(t.key)) state.scopeSel.tags.delete(t.key);
      else state.scopeSel.tags.add(t.key);
      renderTagChips();
      updateSetupCount();
    });
    box.appendChild(c);
  });
  $("#tags-panel").classList.toggle("hidden", shown === 0);
}

function filterPool(sel, onlyWeak) {
  return state.fragen.filter((q) => {
    if (state.excluded[q.id]) return false;

    if (sel.scope === "tb" && q.tb !== sel.tb) return false;
    if (sel.scope === "themen") {
      if (!sel.themen || !sel.themen.size) return false;
      if (!sel.themen.has(q.tb + "|" + q.thema)) return false;
    }

    for (const key of sel.tags) {
      const t = TAGS.find((x) => x.key === key);
      if (t && !t.test(q)) return false;
    }

    if (onlyWeak) {
      const p = state.proFrage[q.id];
      const oftFalsch = p && p.falsch > 0;
      if (!oftFalsch && !state.marks[q.id]) return false;
    }
    return true;
  });
}

function updateSetupCount() {
  const sel = state.scopeSel;
  const pool = filterPool(sel, state.setupMode === "schwach");
  const out = $("#setup-count");

  if (state.setupMode === "durchgang") {
    const ziel = parseInt($("#dg-ziel").value, 10) || 2;
    const erledigt = pool.filter((q) => (state.progress[q.id] || 0) >= ziel).length;
    out.textContent = "Schnellstart: " + (pool.length - erledigt) + " offen · " +
      erledigt + " abgehakt (von " + pool.length + ") · Ziel " + ziel + "× in Folge";
    $("#group-preview").textContent = pool.length
      ? "Neue Gruppe würde " + pool.length + " Fragen umfassen."
      : "Kein Umfang gewählt.";
  } else {
    out.textContent = pool.length + " Fragen im gewählten Umfang";
  }
  $("#btn-start").disabled = pool.length === 0;
}

/* --------------------------------------------------------------- Gruppen */

function scopeToPlain(sel) {
  return {
    scope: sel.scope,
    tb: sel.tb,
    themen: sel.themen ? Array.from(sel.themen) : [],
    tags: Array.from(sel.tags),
  };
}
function scopeFromPlain(p) {
  return {
    scope: p.scope || "alles",
    tb: p.tb === undefined ? null : p.tb,
    themen: new Set(p.themen || []),
    tags: new Set(p.tags || []),
  };
}

function createGroup() {
  const name = $("#group-name").value.trim();
  if (!name) { toast("Bitte einen Namen eingeben"); return; }
  const pool = filterPool(state.scopeSel, false);
  if (!pool.length) { toast("Kein Umfang gewählt"); return; }

  state.groups.push({
    id: uid(),
    name: name,
    scope: scopeToPlain(state.scopeSel),
    ziel: parseInt($("#dg-ziel").value, 10) || 2,
    batchSize: parseInt($("#dg-batch").value, 10) || 0,
    streak: {},
    ts: nowIso(),
  });
  save(KEYS.groups, state.groups);
  $("#group-name").value = "";
  renderGroups();
  toast("Gruppe „" + name + "“ erstellt");
}

function groupProgress(g) {
  const pool = filterPool(scopeFromPlain(g.scope), false);
  const done = pool.filter((q) => (g.streak[q.id] || 0) >= g.ziel).length;
  return { total: pool.length, done: done, pct: pool.length ? Math.round(100 * done / pool.length) : 0 };
}

function renderGroups() {
  const list = $("#group-list");
  list.textContent = "";
  if (!state.groups.length) {
    list.appendChild(el("p", "empty", "Noch keine Gruppen. Wähle oben einen Umfang und erstelle eine Gruppe, um deinen Fortschritt dauerhaft zu behalten."));
    return;
  }

  state.groups.forEach((g) => {
    const p = groupProgress(g);
    const item = el("div", "group-item");

    const body = el("div", "group-body");
    body.appendChild(el("div", "group-name", g.name));
    body.appendChild(el("div", "group-meta",
      p.pct + "% · " + p.done + "/" + p.total + " abgehakt · " + g.ziel + "× in Folge · " +
      (g.batchSize ? "Pause nach " + g.batchSize : "ohne Pause")));
    const bar = el("div", "group-bar");
    const fill = el("div", "group-fill");
    fill.style.width = p.pct + "%";
    bar.appendChild(fill);
    body.appendChild(bar);
    item.appendChild(body);

    const acts = el("div", "group-acts");
    const go = el("button", "btn", p.done >= p.total && p.total ? "Fertig ✓" : "Weiter →");
    go.type = "button";
    go.disabled = p.total === 0 || p.done >= p.total;
    go.addEventListener("click", () => startFromSetup(g));
    acts.appendChild(go);

    const rst = el("button", "btn", "↺");
    rst.type = "button";
    rst.title = "Fortschritt dieser Gruppe zurücksetzen";
    rst.addEventListener("click", () => {
      if (!confirm("Fortschritt der Gruppe „" + g.name + "“ zurücksetzen?")) return;
      g.streak = {};
      save(KEYS.groups, state.groups);
      renderGroups();
    });
    acts.appendChild(rst);

    const del = el("button", "btn", "🗑");
    del.type = "button";
    del.title = "Gruppe löschen";
    del.addEventListener("click", () => {
      if (!confirm("Gruppe „" + g.name + "“ wirklich löschen?")) return;
      state.groups = state.groups.filter((x) => x.id !== g.id);
      save(KEYS.groups, state.groups);
      renderGroups();
    });
    acts.appendChild(del);

    item.appendChild(acts);
    list.appendChild(item);
  });
}

function resetQuickProgress() {
  if (!confirm("Schnellstart-Fortschritt für „Einmal alles durch“ zurücksetzen?")) return;
  state.progress = {};
  save(KEYS.progress, state.progress);
  updateSetupCount();
  toast("Fortschritt zurückgesetzt");
}

/* -------------------------------------------------------------- Session */

function weightedSample(pool, n, weightFn) {
  if (!n || n <= 0 || n >= pool.length) return shuffle(pool);
  const rest = pool.slice();
  const out = [];
  while (out.length < n && rest.length) {
    const weights = rest.map(weightFn);
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let idx = 0;
    for (; idx < rest.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    if (idx >= rest.length) idx = rest.length - 1;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

function startFromSetup(group) {
  const mode = state.setupMode;
  const sel = group ? scopeFromPlain(group.scope) : state.scopeSel;
  const pool = filterPool(sel, mode === "schwach");

  if (!pool.length) {
    toast(mode === "schwach"
      ? "Noch keine schweren Fragen – beantworte zuerst ein paar Fragen oder markiere welche."
      : "Keine Fragen im gewählten Umfang.");
    return;
  }

  if (mode === "durchgang") {
    startDurchgang(pool, group);
    return;
  }

  const anzahl = parseInt($("#anzahl").value, 10);
  const weak = $("#weight-weak").checked;
  const wf = (q) => {
    if (!weak) return 1;
    const p = state.proFrage[q.id];
    const falsch = p ? p.falsch : 0;
    const seen = p ? p.versuche : 0;
    return 1 + falsch * 2 + (state.marks[q.id] ? 1.5 : 0) + (seen === 0 ? 0.3 : 0);
  };

  state.session = {
    mode: mode === "schwach" ? "quiz" : mode,
    label: mode,
    queue: weightedSample(pool, anzahl, wf),
    i: 0,
    results: [],
    hilfen: state.settings.hilfen !== false,
  };
  nav("session");
  renderCard();
}

function startPruefung() {
  const withQ = state.themenbereiche.filter(
    (tb) => state.fragen.some((q) => q.tb === tb.nr && !state.excluded[q.id])
  );
  if (!withQ.length) { toast("Keine Fragen verfügbar."); return; }
  const tb = withQ[Math.floor(Math.random() * withQ.length)];
  const pool = state.fragen.filter((q) => q.tb === tb.nr && !state.excluded[q.id]);

  state.session = {
    mode: "quiz",
    label: "pruefung",
    queue: shuffle(pool).slice(0, Math.min(15, pool.length)),
    i: 0,
    results: [],
    hilfen: false,
    titel: "Themenbereich " + tb.nr + ": " + tb.titel,
  };
  nav("session");
  toast("Dein Themenbereich: " + tb.titel);
  renderCard();
}

function startDurchgang(pool, group) {
  const ziel = group ? group.ziel : (parseInt($("#dg-ziel").value, 10) || 2);
  const batchSize = group ? group.batchSize : (parseInt($("#dg-batch").value, 10) || 0);
  const store = group ? group.streak : state.progress;
  const offen = pool.filter((q) => (store[q.id] || 0) < ziel);

  if (!offen.length) { toast("Alles abgehakt 🎉"); return; }

  state.session = {
    mode: "quiz",
    label: "durchgang",
    durchgang: true,
    groupId: group ? group.id : null,
    groupName: group ? group.name : null,
    ziel: ziel,
    batchSize: batchSize,
    total: pool.length,
    doneCount: pool.length - offen.length,
    queue: shuffle(offen),
    i: 0,
    results: [],
    roundNum: 1,
    roundCorrect: 0,
    seen: new Set(),
    hilfen: state.settings.hilfen !== false,
  };
  nav("session");
  renderCard();
}

function sessStore(s) {
  if (!s.groupId) return state.progress;
  const g = state.groups.find((x) => x.id === s.groupId);
  return g ? g.streak : state.progress;
}
function sessPersist(s) {
  if (s.groupId) save(KEYS.groups, state.groups);
  else save(KEYS.progress, state.progress);
}

function endSession() {
  state.session = null;
  nav("home");
  renderHome();
}

/* ------------------------------------------------------ Karte rendern */

function currentQ() {
  const s = state.session;
  if (!s || !s.queue.length) return null;
  return s.queue[Math.min(s.i, s.queue.length - 1)];
}

function renderCard() {
  const s = state.session;
  if (!s) return;
  const q = currentQ();
  if (!q) { renderSummary(); return; }

  s.tStart = Date.now();
  s.answered = false;

  // Notizzettel bei jeder Frage zurücksetzen
  $("#scratch-area").value = "";
  $("#scratch-area").classList.add("hidden");
  $("#scratch-toggle").textContent = "📝 Notizzettel öffnen";

  updateProgress();
  renderBadges(q);

  $("#q-text").textContent = q.frage;
  $("#mark-btn").textContent = state.marks[q.id] ? "⭐" : "☆";
  $("#mark-btn").classList.toggle("on", !!state.marks[q.id]);

  // Aussagen (Mehrfachauswahl)
  const aus = $("#q-aussagen");
  aus.textContent = "";
  if (q.aussagen && q.aussagen.length) {
    q.aussagen.forEach((a) => aus.appendChild(el("li", null, a)));
    aus.classList.remove("hidden");
  } else {
    aus.classList.add("hidden");
  }

  $("#q-explain").classList.add("hidden");
  $("#q-hilfen").classList.add("hidden");

  const opts = $("#q-options");
  opts.textContent = "";
  const actions = $("#card-actions");
  actions.textContent = "";

  if (s.mode === "karteikarte") {
    const btn = el("button", "btn btn-primary", "Umdrehen ↦ Antwort");
    btn.type = "button";
    btn.addEventListener("click", () => flipCard(q));
    actions.appendChild(btn);
    return;
  }

  const order = state.settings.shuffle !== false
    ? shuffle(q.antworten.map((_, i) => i))
    : q.antworten.map((_, i) => i);

  order.forEach((origIdx, pos) => {
    const b = el("button", "opt clickable");
    b.type = "button";
    b.dataset.orig = String(origIdx);
    b.appendChild(el("span", "opt-key", "ABCDE"[pos] || String(pos + 1)));
    b.appendChild(el("span", "opt-txt", q.antworten[origIdx]));
    b.addEventListener("click", () => answer(q, origIdx));
    opts.appendChild(b);
  });
}

function renderBadges(q) {
  const s = state.session;
  const box = $("#q-badges");
  box.textContent = "";
  box.appendChild(el("span", "badge badge-nr", "#" + q.nr));
  box.appendChild(el("span", "badge badge-tb", "TB " + q.tb + " · " + tbTitle(q.tb)));
  if (q.thema) box.appendChild(el("span", "badge badge-thema", q.thema));
  if (state.marks[q.id]) box.appendChild(el("span", "badge badge-mark", "⭐ schwer"));

  if (s.durchgang) {
    const st = sessStore(s)[q.id] || 0;
    box.appendChild(el("span", "badge badge-streak", "✓ " + st + "/" + s.ziel + " in Folge"));
    if (s.groupName) box.appendChild(el("span", "badge badge-grp", "📋 " + s.groupName));
  }
}

function updateProgress() {
  const s = state.session;
  let pct, txt;
  if (s.durchgang) {
    if (s.batchSize > 0) {
      pct = 100 * s.roundCorrect / s.batchSize;
      txt = "Runde " + s.roundNum + " · " + s.roundCorrect + "/" + s.batchSize +
            " richtig · " + s.doneCount + "/" + s.total + " gemeistert";
    } else {
      pct = 100 * s.doneCount / s.total;
      txt = s.doneCount + "/" + s.total + " gemeistert";
    }
  } else {
    pct = 100 * s.i / s.queue.length;
    txt = (s.i + 1) + " / " + s.queue.length;
  }
  $("#progress-bar").style.width = Math.min(100, pct) + "%";
  $("#session-count").textContent = txt;
}

function flipCard(q) {
  const s = state.session;
  if (s.answered) return;
  s.answered = true;

  const opts = $("#q-options");
  opts.textContent = "";
  const b = el("div", "opt correct");
  b.appendChild(el("span", "opt-key", "✓"));
  b.appendChild(el("span", "opt-txt", q.antworten[q.richtig]));
  opts.appendChild(b);

  showExplain(q);

  const actions = $("#card-actions");
  actions.textContent = "";
  const no = el("button", "btn btn-dontknow", "Nicht gewusst");
  no.type = "button";
  no.addEventListener("click", () => selfRate(q, false));
  const yes = el("button", "btn btn-know", "Gewusst ✓");
  yes.type = "button";
  yes.addEventListener("click", () => selfRate(q, true));
  actions.appendChild(no);
  actions.appendChild(yes);
}

function selfRate(q, correct) {
  logAttempt(q, correct, Date.now() - state.session.tStart);
  state.session.results.push(correct);
  advance();
}

function answer(q, chosen) {
  const s = state.session;
  if (s.answered) return;
  s.answered = true;

  const correct = chosen === q.richtig;
  const ms = Date.now() - s.tStart;

  $$("#q-options .opt").forEach((b) => {
    b.classList.remove("clickable");
    b.disabled = true;
    const orig = parseInt(b.dataset.orig, 10);
    if (orig === q.richtig) b.classList.add("correct");
    else if (orig === chosen) b.classList.add("wrong");
    else b.classList.add("dim");
  });

  logAttempt(q, correct, ms);
  s.results.push(correct);
  showExplain(q);

  const actions = $("#card-actions");
  actions.textContent = "";
  const btn = el("button", "btn btn-primary", "Weiter →");
  btn.type = "button";
  btn.addEventListener("click", () => stepDone(q, correct));
  actions.appendChild(btn);
}

function showExplain(q) {
  const s = state.session;
  const box = $("#q-explain");
  box.textContent = "";
  if (q.erklaerung) {
    box.appendChild(el("p", null, q.erklaerung));
    box.classList.remove("hidden");
  }
  if (s.hilfen) renderHilfen(q);
}

function renderHilfen(q) {
  const box = $("#q-hilfen");
  box.textContent = "";
  let any = false;

  if (q.buch && q.buch.length) {
    any = true;
    const block = el("div", "hilfe-block");
    block.appendChild(el("div", "hilfe-head", "📖 Im Buch nachlesen"));
    q.buch.forEach((b) => {
      const line = el("div", "buch-item");
      line.appendChild(el("span", "buch-band", b.band));
      line.appendChild(document.createTextNode(" → " + b.kapitel));
      block.appendChild(line);
    });
    box.appendChild(block);
  }

  if (q.yt && q.yt.length) {
    any = true;
    const block = el("div", "hilfe-block");
    block.appendChild(el("div", "hilfe-head", "▶ Videos zum Thema suchen"));
    const links = el("div", "yt-links");
    q.yt.forEach((query) => {
      const a = document.createElement("a");
      a.className = "yt-link";
      a.href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(el("span", "yt-icon", "▶"));
      a.appendChild(el("span", null, query));
      links.appendChild(a);
    });
    block.appendChild(links);
    box.appendChild(block);
  }

  box.classList.toggle("hidden", !any);
}

function advance() {
  const s = state.session;
  s.i++;
  if (s.i >= s.queue.length) renderSummary();
  else renderCard();
}

function stepDone(q, correct) {
  const s = state.session;
  if (!s.durchgang) { advance(); return; }

  const store = sessStore(s);
  const firstTry = !s.seen.has(q.id);
  s.seen.add(q.id);
  const autoDone = correct && firstTry && state.settings.first_try_abhaken;

  let st;
  if (autoDone) {
    st = s.ziel;
    store[q.id] = s.ziel;
  } else {
    st = correct ? (store[q.id] || 0) + 1 : 0;
    store[q.id] = st;
  }
  sessPersist(s);

  if (correct) s.roundCorrect++;

  if (st >= s.ziel) {
    s.queue.splice(s.i, 1);
    s.doneCount++;
    if (s.i >= s.queue.length) s.i = 0;
  } else {
    s.i = s.queue.length ? (s.i + 1) % s.queue.length : 0;
  }

  if (!s.queue.length) { renderSummary(); return; }
  if (s.batchSize > 0 && s.roundCorrect >= s.batchSize) { renderRoundDone(); return; }
  renderCard();
}

function renderRoundDone() {
  const s = state.session;
  $("#progress-bar").style.width = "100%";
  $("#q-badges").textContent = "";
  $("#q-text").textContent = "Runde " + s.roundNum + " geschafft ✅ — " + s.roundCorrect + "× richtig!";
  $("#q-aussagen").classList.add("hidden");
  $("#q-hilfen").classList.add("hidden");

  const opts = $("#q-options");
  opts.textContent = "";
  const box = el("div", "explain");
  box.appendChild(el("p", null,
    "Kurze Pause? Noch " + s.queue.length + " Fragen offen. Schon " +
    s.doneCount + "/" + s.total + " gemeistert."));
  opts.appendChild(box);

  const actions = $("#card-actions");
  actions.textContent = "";
  const stop = el("button", "btn", "Für jetzt beenden");
  stop.type = "button";
  stop.addEventListener("click", endSession);
  const next = el("button", "btn btn-primary", "Nächste Runde →");
  next.type = "button";
  next.addEventListener("click", () => {
    s.roundNum++;
    s.roundCorrect = 0;
    renderCard();
  });
  actions.appendChild(stop);
  actions.appendChild(next);
}

function renderSummary() {
  const s = state.session;
  const right = s.results.filter(Boolean).length;
  const total = s.results.length;
  const pct = total ? Math.round(100 * right / total) : 0;

  $("#progress-bar").style.width = "100%";
  $("#session-count").textContent = "";
  $("#q-badges").textContent = "";
  $("#q-aussagen").classList.add("hidden");
  $("#q-explain").classList.add("hidden");
  $("#q-hilfen").classList.add("hidden");
  $("#mark-btn").classList.add("hidden");
  $("#skip-btn").classList.add("hidden");

  $("#q-text").textContent = s.durchgang && !s.queue.length
    ? "Alle Fragen abgehakt 🎉"
    : "Session abgeschlossen 🎉";

  const opts = $("#q-options");
  opts.textContent = "";
  const box = el("div", "explain");
  if (total) {
    box.appendChild(el("p", null, right + " von " + total + " richtig (" + pct + " %)."));
    box.appendChild(el("p", null,
      pct >= 80 ? "Stark! Das sitzt." :
      pct >= 50 ? "Solide – dranbleiben." :
                  "Übung macht die Meisterin. Schau dir die Erklärungen im Archiv nochmal an."));
  }
  opts.appendChild(box);

  const actions = $("#card-actions");
  actions.textContent = "";
  const again = el("button", "btn", "Nochmal");
  again.type = "button";
  again.addEventListener("click", () => onMode(s.label === "durchgang" ? "durchgang" : s.label, true));
  const stats = el("button", "btn", "Statistik");
  stats.type = "button";
  stats.addEventListener("click", () => { state.session = null; nav("stats"); });
  const home = el("button", "btn btn-primary", "Startseite");
  home.type = "button";
  home.addEventListener("click", endSession);
  actions.appendChild(again);
  actions.appendChild(stats);
  actions.appendChild(home);

  $("#mark-btn").classList.remove("hidden");
  $("#skip-btn").classList.remove("hidden");
}

/* ------------------------------------------------- Markieren / Ausblenden */

function toggleMark() {
  const q = currentQ();
  if (!q) return;
  if (state.marks[q.id]) delete state.marks[q.id];
  else state.marks[q.id] = nowIso();
  save(KEYS.marks, state.marks);
  $("#mark-btn").textContent = state.marks[q.id] ? "⭐" : "☆";
  $("#mark-btn").classList.toggle("on", !!state.marks[q.id]);
  toast(state.marks[q.id] ? "Als schwere Frage markiert" : "Markierung entfernt");
}

function excludeCurrent() {
  const q = currentQ();
  if (!q) return;
  if (!confirm("Diese Frage dauerhaft ausblenden? Du findest sie im Archiv wieder.")) return;

  state.excluded[q.id] = nowIso();
  save(KEYS.excluded, state.excluded);

  const s = state.session;
  s.queue.splice(s.i, 1);
  if (s.durchgang) s.total = Math.max(0, s.total - 1);
  if (s.i >= s.queue.length) s.i = 0;
  toast("Frage ausgeblendet");

  if (!s.queue.length) renderSummary();
  else renderCard();
}

/* -------------------------------------------------------------- Versuche */

function logAttempt(q, correct, ms) {
  state.attempts.push({
    ts: nowIso(),
    qid: q.id,
    tb: q.tb,
    thema: q.thema,
    correct: !!correct,
    ms: ms > 0 ? ms : 0,
  });
  if (state.attempts.length > ATTEMPT_CAP) {
    state.attempts = state.attempts.slice(-ATTEMPT_CAP);
  }
  save(KEYS.attempts, state.attempts);

  const pf = state.proFrage[q.id] || { versuche: 0, richtig: 0, falsch: 0 };
  pf.versuche++;
  if (correct) pf.richtig++; else pf.falsch++;
  state.proFrage[q.id] = pf;
}

/* --------------------------------------------------------------- Archiv */

function renderArchivFilters() {
  const sel = $("#archiv-tb");
  state.themenbereiche.forEach((tb) => {
    const o = document.createElement("option");
    o.value = String(tb.nr);
    o.textContent = tb.nr + " · " + tb.titel;
    sel.appendChild(o);
  });
}

function renderArchiv() {
  const term = $("#archiv-search").value.trim().toLowerCase();
  const tbVal = $("#archiv-tb").value;
  const tagVal = $("#archiv-tag").value;

  let list = state.fragen.slice();
  if (tbVal) list = list.filter((q) => String(q.tb) === tbVal);

  if (tagVal === "mark")     list = list.filter((q) => state.marks[q.id]);
  if (tagVal === "excluded") list = list.filter((q) => state.excluded[q.id]);
  if (tagVal === "weak")     list = list.filter((q) => (state.proFrage[q.id] || {}).falsch > 0);
  if (tagVal === "unseen")   list = list.filter((q) => !state.proFrage[q.id]);

  if (term) {
    const num = term.replace(/^#/, "");
    if (/^\d+$/.test(num)) {
      list = list.filter((q) => String(q.nr) === num || String(q.nr).startsWith(num));
    } else {
      list = list.filter((q) => q.frage.toLowerCase().includes(term));
    }
  }

  list.sort((a, b) => a.nr - b.nr);
  const limited = list.slice(0, 150);

  $("#archiv-count").textContent = list.length === 0
    ? "Keine Treffer."
    : list.length > 150
      ? list.length + " Treffer – erste 150 angezeigt (weiter eingrenzen)"
      : list.length + " Treffer";

  const box = $("#archiv-list");
  box.textContent = "";
  limited.forEach((q) => box.appendChild(archivItem(q)));
}

function archivItem(q) {
  const item = el("div", "archiv-item");
  const head = el("button", "archiv-head");
  head.type = "button";

  head.appendChild(el("span", "archiv-nr", "#" + q.nr));
  const mid = el("span", "archiv-q");
  mid.textContent = q.frage;
  const meta = el("span", "archiv-meta");
  meta.textContent = "TB " + q.tb + " · " + q.thema;
  if (state.marks[q.id]) meta.textContent += " · ⭐ markiert";
  if (state.excluded[q.id]) meta.textContent += " · 🚫 ausgeblendet";
  mid.appendChild(meta);
  head.appendChild(mid);

  const detail = el("div", "archiv-detail hidden");
  head.addEventListener("click", () => {
    const open = detail.classList.toggle("hidden");
    if (!open && !detail.dataset.built) {
      buildArchivDetail(detail, q);
      detail.dataset.built = "1";
    }
  });

  item.appendChild(head);
  item.appendChild(detail);
  return item;
}

function buildArchivDetail(box, q) {
  if (q.aussagen && q.aussagen.length) {
    const ol = el("ol", "q-aussagen");
    q.aussagen.forEach((a) => ol.appendChild(el("li", null, a)));
    box.appendChild(ol);
  }

  const opts = el("div", "opts");
  q.antworten.forEach((txt, i) => {
    const o = el("div", "opt" + (i === q.richtig ? " correct" : ""));
    o.appendChild(el("span", "opt-key", "ABCDE"[i] || String(i + 1)));
    o.appendChild(el("span", "opt-txt", txt));
    opts.appendChild(o);
  });
  box.appendChild(opts);

  if (q.erklaerung) {
    const ex = el("div", "explain");
    ex.appendChild(el("p", null, q.erklaerung));
    box.appendChild(ex);
  }

  if (q.buch && q.buch.length) {
    const b = el("div", "hilfe-block");
    b.style.marginTop = "12px";
    b.appendChild(el("div", "hilfe-head", "📖 Im Buch nachlesen"));
    q.buch.forEach((x) => {
      const line = el("div", "buch-item");
      line.appendChild(el("span", "buch-band", x.band));
      line.appendChild(document.createTextNode(" → " + x.kapitel));
      b.appendChild(line);
    });
    box.appendChild(b);
  }

  if (q.yt && q.yt.length) {
    const b = el("div", "hilfe-block");
    b.style.marginTop = "12px";
    b.appendChild(el("div", "hilfe-head", "▶ Videos zum Thema suchen"));
    const links = el("div", "yt-links");
    q.yt.forEach((query) => {
      const a = document.createElement("a");
      a.className = "yt-link";
      a.href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(el("span", "yt-icon", "▶"));
      a.appendChild(el("span", null, query));
      links.appendChild(a);
    });
    b.appendChild(links);
    box.appendChild(b);
  }

  const acts = el("div", "archiv-actions");
  const mark = el("button", "btn", state.marks[q.id] ? "⭐ Markierung entfernen" : "☆ Als schwer markieren");
  mark.type = "button";
  mark.addEventListener("click", () => {
    if (state.marks[q.id]) delete state.marks[q.id]; else state.marks[q.id] = nowIso();
    save(KEYS.marks, state.marks);
    mark.textContent = state.marks[q.id] ? "⭐ Markierung entfernen" : "☆ Als schwer markieren";
    renderArchiv();
  });
  acts.appendChild(mark);

  const exc = el("button", "btn", state.excluded[q.id] ? "↩ Wieder einblenden" : "🚫 Ausblenden");
  exc.type = "button";
  exc.addEventListener("click", () => {
    if (state.excluded[q.id]) delete state.excluded[q.id]; else state.excluded[q.id] = nowIso();
    save(KEYS.excluded, state.excluded);
    renderArchiv();
    renderHome();
  });
  acts.appendChild(exc);
  box.appendChild(acts);
}

/* ------------------------------------------------------------ Statistik */

function buildStats() {
  const rel = state.attempts;
  const gesamt = { versuche: 0, richtig: 0, msSum: 0, msN: 0 };
  const nachTb = {};
  const themen = {};
  const proFrage = {};
  const tage = {};

  rel.forEach((a) => {
    gesamt.versuche++;
    if (a.correct) gesamt.richtig++;
    if (a.ms > 0) { gesamt.msSum += a.ms; gesamt.msN++; }

    const q = state.byId[a.qid];
    const tb = q ? q.tb : a.tb;
    const th = q ? q.thema : a.thema;

    if (tb !== undefined && tb !== null) {
      if (!nachTb[tb]) nachTb[tb] = { versuche: 0, richtig: 0 };
      nachTb[tb].versuche++;
      if (a.correct) nachTb[tb].richtig++;
    }
    if (th) {
      const key = tb + "|" + th;
      if (!themen[key]) themen[key] = { tb: tb, thema: th, versuche: 0, richtig: 0, falsch: 0 };
      themen[key].versuche++;
      if (a.correct) themen[key].richtig++; else themen[key].falsch++;
    }
    if (!proFrage[a.qid]) proFrage[a.qid] = { versuche: 0, richtig: 0, falsch: 0 };
    proFrage[a.qid].versuche++;
    if (a.correct) proFrage[a.qid].richtig++; else proFrage[a.qid].falsch++;

    const tag = a.ts.slice(0, 10);
    if (!tage[tag]) tage[tag] = { versuche: 0, richtig: 0 };
    tage[tag].versuche++;
    if (a.correct) tage[tag].richtig++;
  });

  const quote = (o) => (o.versuche ? Math.round(100 * o.richtig / o.versuche) : 0);

  const themenListe = Object.values(themen)
    .filter((t) => t.versuche >= 2)
    .sort((a, b) => quote(a) - quote(b) || b.falsch - a.falsch)
    .slice(0, 8);

  const schwaechste = Object.entries(proFrage)
    .map(([qid, o]) => ({ qid: qid, ...o, quote: quote(o) }))
    .filter((x) => x.falsch > 0)
    .sort((a, b) => b.falsch - a.falsch || a.quote - b.quote)
    .slice(0, 15);

  const verlauf = Object.keys(tage).sort().slice(-30)
    .map((d) => ({ datum: d, quote: quote(tage[d]), versuche: tage[d].versuche }));

  return {
    gesamt: { ...gesamt, quote: quote(gesamt), msAvg: gesamt.msN ? Math.round(gesamt.msSum / gesamt.msN) : 0 },
    nachTb: nachTb,
    themen: themenListe,
    schwaechste: schwaechste,
    verlauf: verlauf,
    lernTage: Object.keys(tage).length,
    quote: quote,
  };
}

function qColor(pct) {
  return pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
}

function renderStats() {
  const st = buildStats();
  const quote = st.quote;

  const kpis = [
    { val: st.gesamt.quote + " %", lab: "Trefferquote" },
    { val: String(st.gesamt.versuche), lab: "beantwortete Fragen" },
    { val: st.gesamt.msAvg ? (st.gesamt.msAvg / 1000).toFixed(1) + " s" : "–", lab: "Ø Zeit / Frage" },
    { val: String(st.lernTage), lab: "Lerntage" },
    { val: String(Object.keys(state.marks).length), lab: "schwere Fragen" },
  ];
  const row = $("#kpi-row");
  row.textContent = "";
  kpis.forEach((k) => {
    const c = el("div", "kpi");
    c.appendChild(el("div", "kpi-val", k.val));
    c.appendChild(el("div", "kpi-lab", k.lab));
    row.appendChild(c);
  });

  // Themenbereiche
  const bars = $("#tb-bars");
  bars.textContent = "";
  const tbKeys = Object.keys(st.nachTb);
  if (!tbKeys.length) {
    bars.appendChild(el("p", "empty", "Noch keine Daten – beantworte ein paar Fragen."));
  } else {
    state.themenbereiche.forEach((tb) => {
      const o = st.nachTb[tb.nr];
      if (!o) return;
      const pct = quote(o);
      const r = el("div", "bar-row");
      const left = el("div");
      left.appendChild(el("div", "bar-label", tb.nr + " · " + tb.titel));
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = pct + "%";
      fill.style.background = qColor(pct);
      track.appendChild(fill);
      left.appendChild(track);
      r.appendChild(left);
      r.appendChild(el("div", "bar-pct", pct + "%"));
      bars.appendChild(r);
    });
  }

  // Schwache Themen
  const weakBox = $("#weak-themen");
  weakBox.textContent = "";
  if (!st.themen.length) {
    weakBox.appendChild(el("p", "empty", "Noch zu wenig Daten."));
  } else {
    st.themen.forEach((t) => {
      const pct = quote(t);
      const r = el("div", "bar-row");
      const left = el("div");
      left.appendChild(el("div", "bar-label", t.thema));
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = pct + "%";
      fill.style.background = qColor(pct);
      track.appendChild(fill);
      left.appendChild(track);
      r.appendChild(left);
      r.appendChild(el("div", "bar-pct", pct + "%"));
      weakBox.appendChild(r);
    });
  }

  // Verlauf
  const vBox = $("#verlauf-chart");
  vBox.textContent = "";
  if (!st.verlauf.length) {
    vBox.appendChild(el("p", "empty", "Noch keine Lerntage erfasst."));
  } else {
    const spark = el("div", "spark");
    st.verlauf.forEach((d) => {
      const col = el("div", "spark-col");
      col.style.height = Math.max(4, d.quote) + "%";
      col.style.background = qColor(d.quote);
      col.title = d.datum + ": " + d.quote + "% (" + d.versuche + " Fragen)";
      spark.appendChild(col);
    });
    vBox.appendChild(spark);
    vBox.appendChild(el("p", "muted small",
      st.verlauf[0].datum + " bis " + st.verlauf[st.verlauf.length - 1].datum));
  }

  // Häufig falsch
  const wl = $("#weak-list");
  wl.textContent = "";
  if (!st.schwaechste.length) {
    wl.appendChild(el("p", "empty", "Noch keine falsch beantworteten Fragen."));
  } else {
    st.schwaechste.forEach((x) => {
      const q = state.byId[x.qid];
      if (!q) return;
      const r = el("div", "wrow");
      const left = el("div");
      left.appendChild(el("div", "wrow-q", q.frage));
      left.appendChild(el("div", "wrow-meta", "TB " + q.tb + " · " + q.thema));
      r.appendChild(left);
      r.appendChild(el("span", "pill", x.falsch + "× falsch"));
      r.appendChild(el("span", "bar-pct", x.quote + "%"));
      wl.appendChild(r);
    });
  }
}

/* ------------------------------------------------------ Daten & Geräte */

function renderDaten() {
  syncSettingsUi();

  const info = $("#export-info");
  const n = state.attempts.length;
  info.textContent = "Aktuell gespeichert: " + Object.keys(state.marks).length +
    " markierte, " + Object.keys(state.excluded).length + " ausgeblendete Fragen, " +
    state.groups.length + " Gruppen, " + n + " beantwortete Fragen.";

  const box = $("#excluded-list");
  box.textContent = "";
  const ids = Object.keys(state.excluded);
  if (!ids.length) {
    box.appendChild(el("p", "empty", "Keine Fragen ausgeblendet."));
    return;
  }
  ids.forEach((id) => {
    const q = state.byId[id];
    if (!q) return;
    const r = el("div", "wrow");
    const left = el("div");
    left.appendChild(el("div", "wrow-q", "#" + q.nr + " · " + q.frage));
    left.appendChild(el("div", "wrow-meta", "TB " + q.tb + " · " + q.thema));
    r.appendChild(left);
    const btn = el("button", "btn", "↩ Zurückholen");
    btn.type = "button";
    btn.addEventListener("click", () => {
      delete state.excluded[id];
      save(KEYS.excluded, state.excluded);
      renderDaten();
      renderHome();
      toast("Frage wieder eingeblendet");
    });
    r.appendChild(btn);
    box.appendChild(r);
  });
}

function exportData() {
  const payload = {
    app: "anni2026_maturalerner",
    version: 1,
    exportiert: nowIso(),
    daten: {
      marks:    state.marks,
      excluded: state.excluded,
      progress: state.progress,
      groups:   state.groups,
      attempts: state.attempts,
      settings: state.settings,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "maturalerner-fortschritt-" + nowIso().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Fortschritt exportiert");
}

function importData(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try {
      payload = JSON.parse(reader.result);
    } catch (err) {
      toast("Datei konnte nicht gelesen werden.");
      return;
    }
    const d = payload && payload.daten;
    if (!d || payload.app !== "anni2026_maturalerner") {
      toast("Das ist keine gültige Sicherungsdatei.");
      return;
    }

    const modus = confirm(
      "OK = Zusammenführen (dein bisheriger Fortschritt bleibt und wird ergänzt)\n" +
      "Abbrechen = Ersetzen (alles Bisherige auf diesem Gerät wird überschrieben)"
    );

    if (modus) {
      state.marks    = Object.assign({}, state.marks, d.marks || {});
      state.excluded = Object.assign({}, state.excluded, d.excluded || {});
      state.settings = Object.assign({}, state.settings, d.settings || {});

      const p = d.progress || {};
      Object.keys(p).forEach((qid) => {
        state.progress[qid] = Math.max(state.progress[qid] || 0, p[qid]);
      });

      const have = new Set(state.groups.map((g) => g.id));
      (d.groups || []).forEach((g) => {
        if (have.has(g.id)) {
          const mine = state.groups.find((x) => x.id === g.id);
          Object.keys(g.streak || {}).forEach((qid) => {
            mine.streak[qid] = Math.max(mine.streak[qid] || 0, g.streak[qid]);
          });
        } else {
          state.groups.push(g);
        }
      });

      const seen = new Set(state.attempts.map((a) => a.ts + "|" + a.qid));
      (d.attempts || []).forEach((a) => {
        if (!seen.has(a.ts + "|" + a.qid)) state.attempts.push(a);
      });
      state.attempts.sort((a, b) => (a.ts < b.ts ? -1 : 1));
      if (state.attempts.length > ATTEMPT_CAP) state.attempts = state.attempts.slice(-ATTEMPT_CAP);
    } else {
      state.marks    = d.marks    || {};
      state.excluded = d.excluded || {};
      state.progress = d.progress || {};
      state.groups   = d.groups   || [];
      state.attempts = d.attempts || [];
      state.settings = Object.assign({ first_try_abhaken: false, shuffle: true, hilfen: true }, d.settings || {});
    }

    save(KEYS.marks, state.marks);
    save(KEYS.excluded, state.excluded);
    save(KEYS.progress, state.progress);
    save(KEYS.groups, state.groups);
    save(KEYS.attempts, state.attempts);
    save(KEYS.settings, state.settings);

    recomputeProFrage();
    renderHome();
    renderDaten();
    toast(modus ? "Fortschritt zusammengeführt" : "Fortschritt ersetzt");
  };
  reader.readAsText(file);
  e.target.value = "";
}

function wipeAll() {
  if (!confirm("Wirklich ALLE Daten dieser App auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.")) return;
  if (!confirm("Sicher? Exportiere vorher, falls du den Fortschritt behalten willst.")) return;
  // Das Thema ist eine reine Anzeigeeinstellung und bleibt erhalten.
  Object.entries(KEYS).forEach(([name, k]) => {
    if (name !== "theme") localStorage.removeItem(k);
  });
  state.marks = {}; state.excluded = {}; state.progress = {};
  state.groups = []; state.attempts = [];
  state.settings = { first_try_abhaken: false, shuffle: true, hilfen: true };
  recomputeProFrage();
  renderHome();
  renderDaten();
  toast("Alle Daten gelöscht");
}

/* ------------------------------------------------------------- Tastatur */

function onKeydown(e) {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$("#view-session").classList.contains("active")) return;

  const opts = $$("#q-options .opt.clickable");
  if (/^[1-5]$/.test(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    if (opts[idx]) { e.preventDefault(); opts[idx].click(); return; }
    if (!opts.length) {
      const know = $(".btn-know"), dont = $(".btn-dontknow");
      if (e.key === "1" && dont) { e.preventDefault(); dont.click(); }
      if (e.key === "2" && know) { e.preventDefault(); know.click(); }
    }
    return;
  }

  if (e.key === "Enter" || e.key === " ") {
    const btns = $$("#card-actions .btn");
    const pick = btns.find((b) => /Weiter|Nächste|Umdrehen/.test(b.textContent)) ||
                 btns.find((b) => b.classList.contains("btn-know"));
    if (pick) { e.preventDefault(); pick.click(); }
  }
}

/* ------------------------------------------------------------------ Los */

document.addEventListener("DOMContentLoaded", init);
