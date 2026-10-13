/* =========================================================
   Persönliche Webseite – Script
   1. Light/Night Mode   (initTheme)
   2. Barrierefreie Tabs (initTabs)
   3. News aus JSON      (loadNews, renderNews, createNewsCard)
   4. Termine-Woche     (loadTermine, renderWeek, buildWeekGrid, assignLanes)
   5. Gemeinsame Helfer  (fetchJsonArray, showLoadError)
   ========================================================= */

"use strict";

/* Pfade zu den Daten – relativ, damit es lokal und auf GitHub Pages läuft */
const NEWS_URL = "assets/news.json";
const TERMINE_URL = "assets/termine.json";
const THEME_KEY = "theme";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  loadNews();
  loadTermine();
});

/* ---------- 1. Light/Night Mode ---------- */

/**
 * Das Start-Theme wird bereits im <head> gesetzt (verhindert Aufblitzen).
 * Hier wird nur der Schalter verdrahtet: Klick wechselt das Theme und
 * speichert die Wahl in localStorage.
 */
function initTheme() {
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  const applyTheme = (theme) => {
    root.setAttribute("data-theme", theme);
    toggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Light Mode aktivieren" : "Night Mode aktivieren"
    );
  };

  applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");

  toggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* localStorage kann blockiert sein (z. B. privater Modus) – Theme gilt dann nur für diese Sitzung */
    }
  });

  // Folgt der Systemeinstellung, solange der Nutzer noch nichts gewählt hat
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) { /* ignorieren */ }
    if (!saved) applyTheme(event.matches ? "dark" : "light");
  });
}

/* ---------- 2. Tabs ---------- */

/**
 * Tabs nach dem WAI-ARIA-Muster "Tabs with automatic activation":
 * - Klick aktiviert einen Tab
 * - Pfeiltasten links/rechts, Pos1/Ende wechseln den Tab
 * - Nur der aktive Tab ist per Tab-Taste erreichbar (roving tabindex)
 */
function initTabs() {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tabs, tab));
  });

  tablist.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;

    let next = null;
    switch (event.key) {
      case "ArrowRight": next = tabs[(index + 1) % tabs.length]; break;
      case "ArrowLeft":  next = tabs[(index - 1 + tabs.length) % tabs.length]; break;
      case "Home":       next = tabs[0]; break;
      case "End":        next = tabs[tabs.length - 1]; break;
      default: return;
    }
    event.preventDefault();
    activateTab(tabs, next);
    next.focus();
  });
}

/** Zeigt das Panel des gewählten Tabs und versteckt alle anderen. */
function activateTab(tabs, selected) {
  tabs.forEach((tab) => {
    const isSelected = tab === selected;
    const panel = document.getElementById(tab.getAttribute("aria-controls"));

    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
    // Das Entfernen von "hidden" startet die CSS-Einblendanimation (siehe .tab-panel)
    if (panel) panel.hidden = !isSelected;
  });
}

/* ---------- 3. News ---------- */

/**
 * Lädt die News aus assets/news.json und rendert sie als Karten.
 * Neue Meldungen erscheinen allein durch Ergänzen der JSON-Datei.
 *
 * Hinweis: fetch() funktioniert NICHT, wenn index.html direkt per
 * Doppelklick (file://) geöffnet wird. Lokal einen kleinen Server
 * starten, z. B. im Projektordner:  python -m http.server
 * und dann http://localhost:8000 öffnen.
 */
async function loadNews() {
  const container = document.getElementById("news-list");
  if (!container) return;

  try {
    renderNews(container, await fetchJsonArray(NEWS_URL));
  } catch (error) {
    console.warn("News konnten nicht geladen werden:", error);
    showLoadError(container, "Die News konnten leider nicht geladen werden.");
  }
}

/** Sortiert die Einträge (neueste zuerst) und hängt die Karten ein. */
function renderNews(container, items) {
  const sorted = items
    .filter((item) => item && item.title)
    .sort((a, b) => sortValue(b.date) - sortValue(a.date));

  container.replaceChildren();

  if (sorted.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "Aktuell gibt es keine Neuigkeiten.";
    container.append(empty);
    return;
  }

  sorted.forEach((item) => container.append(createNewsCard(item)));
}

/**
 * Baut eine News-Karte. Inhalte werden per textContent gesetzt
 * (nicht innerHTML), damit Text aus der JSON nie als HTML ausgeführt wird.
 */
function createNewsCard(item) {
  const card = document.createElement("article");
  card.className = "card news-card";

  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.imageAlt || "";
    img.loading = "lazy";
    img.decoding = "async";
    card.append(img);
  }

  const body = document.createElement("div");
  body.className = "news-body";

  const date = parseDate(item.date);
  if (!Number.isNaN(date.getTime())) {
    const time = document.createElement("time");
    time.className = "news-date";
    time.dateTime = item.date;
    time.textContent = date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    body.append(time);
  }

  const title = document.createElement("h3");
  title.textContent = item.title;
  body.append(title);

  if (item.text) {
    const text = document.createElement("p");
    text.textContent = item.text;
    body.append(text);
  }

  card.append(body);
  return card;
}

/**
 * Wandelt "JJJJ-MM-TT" in ein lokales Datum um.
 * (new Date("2026-10-01") würde als UTC interpretiert und kann je nach
 * Zeitzone einen Tag verrutschen.) Ungültige Werte ergeben ein "Invalid Date".
 */
function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Zahl zum Sortieren – Einträge ohne gültiges Datum landen am Ende. */
function sortValue(value) {
  const time = parseDate(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/* ---------- 4. Termine: Wochenansicht (Stundenplan) ---------- */

/*
 * assets/termine.json wird von der GitHub Action (scripts/ics_to_json.py)
 * alle 3 Stunden aus dem Kalender erzeugt. Format pro Termin:
 *   { title, start, end, allDay, location }  – start/end als ISO 8601 mit Offset,
 *   bei ganztägigen Terminen ist "end" exklusiv (00:00 des Folgetags).
 *
 * Darstellung: CSS-Grid mit einer Spalte je Wochentag und 45 Zeilen à
 * 15 Minuten (08:15–19:30). Termine werden pro Tag absolut positioniert:
 * --start/--span (in 15-Minuten-Zeilen) ergeben top/height, --lane/--lanes
 * die Breite bei Überschneidungen (siehe .week-event im CSS).
 *
 * Alle Datums- und Zeitangaben gelten in Europe/Berlin – unabhängig von
 * der Zeitzone des Besuchers.
 */
const TIME_ZONE = "Europe/Berlin";
const GRID_START_MIN = 8 * 60 + 15;  // 08:15 Uhr
const GRID_END_MIN = 19 * 60 + 30;   // 19:30 Uhr
const SLOT_MIN = 15;                 // Minuten pro Rasterzeile
const SLOT_COUNT = (GRID_END_MIN - GRID_START_MIN) / SLOT_MIN; // 45 Zeilen
const SUBJECT_COLOR_COUNT = 8;       // Anzahl Farben --subject-0 … --subject-7 im CSS
const WARNING_PATTERN = /⚠|⏳/u;     // solche Titel bekommen die Warnfarbe

// Formatter einmal anlegen statt bei jedem Termin neu
const dayPartsFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit",
});
const minutePartsFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/* Zustand der Wochenansicht */
const week = {
  termine: [],   // aufbereitete Termine (siehe prepareTermine)
  weekStart: "", // Montag der angezeigten Woche, "JJJJ-MM-TT"
  todayKey: "",  // heutiger Tag, "JJJJ-MM-TT"
  minKey: "",    // erster Tag mit Daten
  maxKey: "",    // letzter Tag mit Daten
  timer: null,   // Intervall für die Jetzt-Linie
  els: null,     // DOM-Referenzen
};

/** Lädt die Termine und startet die Wochenansicht. */
async function loadTermine() {
  const container = document.getElementById("termine-week");
  if (!container) return;

  try {
    initWeekView(container, await fetchJsonArray(TERMINE_URL));
  } catch (error) {
    console.warn("Termine konnten nicht geladen werden:", error);
    showLoadError(container, "Die Termine konnten leider nicht geladen werden.");
  }
}

/** Richtet Zustand und Navigation ein und zeigt die aktuelle Woche. */
function initWeekView(container, items) {
  week.els = {
    container,
    nav: document.getElementById("week-nav"),
    prev: document.getElementById("week-prev"),
    today: document.getElementById("week-today"),
    next: document.getElementById("week-next"),
    label: document.getElementById("week-label"),
  };

  week.termine = prepareTermine(items);
  week.todayKey = dayKey(new Date());
  week.weekStart = weekStartOf(week.todayKey);
  if (week.termine.length > 0) {
    week.minKey = week.termine.reduce((min, t) => (t.startKey < min ? t.startKey : min), week.termine[0].startKey);
    week.maxKey = week.termine.reduce((max, t) => (t.lastDayKey > max ? t.lastDayKey : max), week.termine[0].lastDayKey);
  }

  const { prev, today, next, nav } = week.els;
  prev.addEventListener("click", () => goToWeek(addDays(week.weekStart, -7), prev));
  next.addEventListener("click", () => goToWeek(addDays(week.weekStart, 7), next));
  today.addEventListener("click", () => goToWeek(weekStartOf(week.todayKey), today));
  nav.hidden = false;

  renderWeek();
  // Jetzt-Linie und "vergangen"-Markierung jede Minute aktualisieren
  week.timer = setInterval(updateNowLine, 60 * 1000);
}

/**
 * Wechselt die Woche. Wird der geklickte Button dabei deaktiviert,
 * springt der Fokus auf "Heute", damit Tastaturnutzer nicht "ins Leere" fallen.
 */
function goToWeek(weekStart, button) {
  week.weekStart = weekStart;
  renderWeek();
  if (button.disabled) week.els.today.focus();
}

/**
 * Bereitet die Rohdaten auf: ungültige Einträge fallen weg; jeder Termin
 * bekommt Tagesschlüssel, Kurzraum, Fachfarbe und Warn-Kennzeichen.
 */
function prepareTermine(items) {
  return items
    .map((item) => {
      if (!item || typeof item.title !== "string") return null;
      const start = new Date(item.start);
      let end = new Date(item.end);
      if (Number.isNaN(start.getTime())) return null;
      if (Number.isNaN(end.getTime()) || end < start) end = start;

      const location = typeof item.location === "string" ? item.location.trim() : "";
      return {
        title: item.title.trim() || "(ohne Titel)",
        start,
        end,
        allDay: item.allDay === true,
        location,
        // Raum = Teil vor dem ersten Komma ("d1.07, Lucy-Hillebrand-Straße 2, Mainz" -> "d1.07")
        room: location.split(",")[0].trim(),
        startKey: dayKey(start),
        // Letzter belegter Tag: Ende ist exklusiv, daher 1 ms abziehen
        lastDayKey: dayKey(end > start ? new Date(end.getTime() - 1) : end),
        subject: subjectColorIndex(item.title),
        warning: WARNING_PATTERN.test(item.title),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, "de"));
}

/**
 * Farbe pro Fach: Das erste Wort des Titels (z. B. "Verm5", "GDI", "Photo"),
 * Emojis davor werden übersprungen, wird zu einem festen Index 0–7 gehasht.
 * Gleiches Fach -> immer gleiche Farbe.
 */
function subjectColorIndex(title) {
  const match = /[\p{L}\p{N}][\p{L}\p{N}_-]*/u.exec(title);
  const word = match ? match[0].toLowerCase() : "";
  let hash = 0;
  for (const char of word) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % SUBJECT_COLOR_COUNT;
}

/* --- Rendern --- */

/** Zeichnet die aktuell gewählte Woche neu (Navigation + Raster). */
function renderWeek() {
  const { container } = week.els;
  const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(week.weekStart, i));
  const weekEnd = weekKeys[6];
  const weekTermine = week.termine.filter((t) => t.lastDayKey >= week.weekStart && t.startKey <= weekEnd);

  // Montag–Freitag immer, Samstag/Sonntag nur mit Termin
  const days = weekKeys.filter((key, i) =>
    i < 5 || weekTermine.some((t) => t.startKey <= key && t.lastDayKey >= key));

  updateNav(days);
  container.replaceChildren();

  if (week.termine.length === 0) {
    container.append(statusText("Keine anstehenden Termine."));
    return;
  }
  if (weekTermine.length === 0) {
    container.append(statusText("Keine Termine in dieser Woche."));
  }

  container.append(buildWeekGrid(days, weekTermine));
  updateNowLine();
}

/** Buttons (de)aktivieren und "KW 42 · 12.–16. Oktober 2026" anzeigen. */
function updateNav(days) {
  const { prev, next, label } = week.els;
  const hasData = week.termine.length > 0;
  // Zurück nur, wenn die Vorwoche noch Daten enthält; Vor nur, wenn die Folgewoche welche hat
  prev.disabled = !hasData || addDays(week.weekStart, -1) < week.minKey;
  next.disabled = !hasData || addDays(week.weekStart, 7) > week.maxKey;
  label.textContent = `KW ${isoWeek(week.weekStart)} · ${formatDateRange(days[0], days[days.length - 1])}`;
}

/** Baut das komplette Raster einer Woche. */
function buildWeekGrid(days, weekTermine) {
  // Scrollbereich ist per Tastatur fokussierbar (Pfeiltasten scrollen horizontal)
  const scroll = document.createElement("div");
  scroll.className = "card week-scroll";
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", `Stundenplan ${week.els.label.textContent}`);

  const grid = document.createElement("div");
  grid.className = "week-grid";
  grid.style.setProperty("--days", days.length);
  grid.style.setProperty("--slots", SLOT_COUNT);

  // Ecke oben links (über der Zeitachse), bleibt beim Scrollen stehen
  const corner = document.createElement("div");
  corner.className = "week-corner";
  grid.append(corner);

  let hasAllDayRow = false;

  days.forEach((key, index) => {
    const column = index + 2; // Spalte 1 = Zeitachse
    const isToday = key === week.todayKey;

    // Kopfzeile: "Di 14.10."
    const head = document.createElement("div");
    head.className = "week-day-head";
    head.style.gridColumn = column;
    head.textContent = formatColumnHead(key);
    if (isToday) {
      head.classList.add("is-today");
      head.setAttribute("aria-current", "date");
    }

    // Termine dieses Tages in Leiste (ganztägig / außerhalb 08:15–19:30) und Raster aufteilen
    const barItems = [];
    const segments = [];
    weekTermine
      .filter((t) => t.startKey <= key && t.lastDayKey >= key)
      .forEach((termin) => {
        if (termin.allDay) {
          barItems.push({ termin, key, prefix: "" });
          return;
        }
        const seg = daySegment(termin, key);
        if (seg.endMin <= GRID_START_MIN || seg.startMin >= GRID_END_MIN) {
          // Liegt an diesem Tag komplett außerhalb des Rasters -> nicht verlieren,
          // sondern mit Uhrzeit in der Leiste oben anzeigen
          const prefix = key === termin.startKey
            ? `${formatMinutes(seg.startMin)} `
            : `bis ${formatMinutes(seg.endMin)} `;
          barItems.push({ termin, key, prefix });
          return;
        }
        segments.push(seg);
      });

    // Leiste für ganztägige Termine unter der Kopfzeile
    const bar = document.createElement("div");
    bar.className = "week-allday";
    bar.style.gridColumn = column;
    barItems.forEach((item) => bar.append(createAllDayItem(item)));
    if (barItems.length > 0) hasAllDayRow = true;

    // Tagesspalte mit Rasterlinien und Terminblöcken
    const body = document.createElement("div");
    body.className = "week-day-body";
    body.style.gridColumn = column;
    if (isToday) body.classList.add("is-today");
    assignLanes(segments);
    segments.forEach((seg) => body.append(createEventBlock(seg, key)));

    grid.append(head, bar, body);
  });

  if (!hasAllDayRow) grid.classList.add("no-allday");

  // Zeitachse: 45 Beschriftungen, volle Stunden hervorgehoben
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const minutes = GRID_START_MIN + slot * SLOT_MIN;
    const label = document.createElement("div");
    label.className = minutes % 60 === 0 ? "week-time is-hour" : "week-time";
    label.style.gridRow = slot + 3; // Zeile 1 = Kopf, Zeile 2 = Ganztagsleiste
    label.textContent = formatMinutes(minutes);
    label.setAttribute("aria-hidden", "true");
    grid.append(label);
  }

  scroll.append(grid);
  return scroll;
}

/**
 * Anteil eines (evtl. mehrtägigen) Termins an einem Tag, in Minuten ab 00:00.
 * Am Starttag beginnt er zur Startzeit, an Folgetagen um 00:00;
 * am Endtag endet er zur Endzeit, sonst um 24:00.
 */
function daySegment(termin, key) {
  const startMin = key === termin.startKey ? minutesOfDay(termin.start) : 0;
  const endMin = key === dayKey(termin.end) ? minutesOfDay(termin.end) : 24 * 60;
  return { termin, startMin, endMin };
}

/**
 * Kürzt Segmente auf 08:15–19:30 und verteilt überlappende Termine auf
 * nebeneinanderliegende Spuren ("lanes"). Alle Termine einer Gruppe von
 * sich (auch indirekt) überschneidenden Terminen teilen sich die Breite.
 */
function assignLanes(segments) {
  segments.forEach((seg) => {
    seg.top = Math.max(seg.startMin, GRID_START_MIN);
    // Mindesthöhe eine Zeile, damit auch sehr kurze Termine (z. B. Fristen) sichtbar sind
    seg.bottom = Math.min(Math.max(seg.endMin, seg.top + SLOT_MIN), GRID_END_MIN);
    seg.clippedTop = seg.startMin < GRID_START_MIN;
    seg.clippedBottom = seg.endMin > GRID_END_MIN;
  });
  segments.sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  let group = [];
  let groupEnd = -1;
  let laneEnds = []; // Endzeit des letzten Termins je Spur

  const closeGroup = () => {
    const lanes = laneEnds.length;
    group.forEach((seg) => { seg.lanes = lanes; });
    group = [];
    laneEnds = [];
  };

  segments.forEach((seg) => {
    if (group.length > 0 && seg.top >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= seg.top);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = seg.bottom;
    seg.lane = lane;
    group.push(seg);
    groupEnd = Math.max(groupEnd, seg.bottom);
  });
  if (group.length > 0) closeGroup();
}

/** Terminblock im Raster: Titel + Raum, Details im Tooltip und aria-label. */
function createEventBlock(seg, key) {
  const { termin } = seg;
  const block = document.createElement("article");
  block.className = `week-event subject-${termin.subject}`;
  if (termin.warning) block.classList.add("is-warning");
  if (seg.clippedTop) block.classList.add("clipped-top");
  if (seg.clippedBottom) block.classList.add("clipped-bottom");

  // Position/Größe in 15-Minuten-Zeilen, Breite über Spuren (siehe CSS)
  block.style.setProperty("--start", (seg.top - GRID_START_MIN) / SLOT_MIN);
  block.style.setProperty("--span", (seg.bottom - seg.top) / SLOT_MIN);
  block.style.setProperty("--lane", seg.lane);
  block.style.setProperty("--lanes", seg.lanes);
  block.dataset.end = String(termin.end.getTime());

  block.title = tooltipText(termin);
  block.setAttribute("aria-label", ariaText(termin, key));

  const title = document.createElement("h4");
  title.textContent = termin.title;
  block.append(title);

  if (termin.room) {
    const room = document.createElement("p");
    room.textContent = termin.room;
    block.append(room);
  }
  return block;
}

/** Eintrag in der Ganztagsleiste (auch für Termine außerhalb 08:15–19:30). */
function createAllDayItem({ termin, key, prefix }) {
  const item = document.createElement("article");
  item.className = `week-allday-item subject-${termin.subject}`;
  if (termin.warning) item.classList.add("is-warning");
  item.dataset.end = String(termin.end.getTime());
  item.title = tooltipText(termin);
  item.setAttribute("aria-label", ariaText(termin, key));
  item.textContent = prefix + termin.title;
  return item;
}

/** Tooltip: Titel, Uhrzeit von–bis, kompletter Ort – je eine Zeile. */
function tooltipText(termin) {
  const lines = [termin.title, `${formatDayHeading(termin.startKey, week.todayKey)}, ${formatTimeRange(termin)}`];
  if (termin.location) lines.push(termin.location);
  return lines.join("\n");
}

/** Screenreader-Text: Titel, Datum, Uhrzeit, Raum. */
function ariaText(termin, key) {
  const parts = [termin.title, formatDayHeading(key, week.todayKey), formatTimeRange(termin)];
  if (termin.room) parts.push(`Raum ${termin.room}`);
  return parts.join(", ");
}

/**
 * Setzt die Linie für die aktuelle Uhrzeit in die heutige Spalte und
 * markiert vergangene Termine. Läuft beim Rendern und dann jede Minute.
 * Nach Mitternacht wird die Ansicht auf den neuen Tag umgestellt.
 */
function updateNowLine() {
  const now = new Date();
  const todayKey = dayKey(now);

  if (todayKey !== week.todayKey) {
    const wasCurrentWeek = week.weekStart === weekStartOf(week.todayKey);
    week.todayKey = todayKey;
    if (wasCurrentWeek) week.weekStart = weekStartOf(todayKey);
    renderWeek(); // ruft updateNowLine erneut auf – dann mit aktuellem Tag
    return;
  }

  const { container } = week.els;
  container.querySelectorAll(".week-now-line").forEach((line) => line.remove());

  const minutes = minutesOfDay(now);
  const body = container.querySelector(".week-day-body.is-today");
  if (body && minutes >= GRID_START_MIN && minutes <= GRID_END_MIN) {
    const line = document.createElement("div");
    line.className = "week-now-line";
    line.setAttribute("aria-hidden", "true");
    line.style.setProperty("--start", (minutes - GRID_START_MIN) / SLOT_MIN);
    body.append(line);
  }

  // Bereits beendete Termine dezent abdunkeln
  container.querySelectorAll("[data-end]").forEach((el) => {
    el.classList.toggle("is-past", Number(el.dataset.end) <= now.getTime());
  });
}

/* --- Format-Helfer --- */

/** "08:15–09:45 Uhr", "ganztägig", über Mitternacht mit Enddatum. */
function formatTimeRange(termin) {
  if (termin.allDay) {
    return termin.lastDayKey === termin.startKey
      ? "ganztägig"
      : `ganztägig bis ${formatShortDate(termin.lastDayKey)}`;
  }

  const from = timeFormat.format(termin.start);
  const to = timeFormat.format(termin.end);
  if (termin.end.getTime() === termin.start.getTime()) return `${from} Uhr`;
  if (dayKey(termin.end) !== termin.startKey) {
    return `${from} Uhr – ${formatShortDate(dayKey(termin.end))}, ${to} Uhr`;
  }
  return `${from}–${to} Uhr`;
}

/** Spaltenkopf "Di 14.10." */
function formatColumnHead(key) {
  const date = keyToDate(key);
  const weekday = date.toLocaleDateString("de-DE", { timeZone: "UTC", weekday: "short" }).replace(".", "");
  return `${weekday} ${formatShortDate(key)}`;
}

/** "12.–16. Oktober 2026", über Monats-/Jahresgrenzen entsprechend länger. */
function formatDateRange(fromKey, toKey) {
  const monthName = (key) => keyToDate(key).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long" });
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);

  if (y1 === y2 && m1 === m2) return `${d1}.–${d2}. ${monthName(toKey)} ${y2}`;
  if (y1 === y2) return `${d1}. ${monthName(fromKey)} – ${d2}. ${monthName(toKey)} ${y2}`;
  return `${d1}. ${monthName(fromKey)} ${y1} – ${d2}. ${monthName(toKey)} ${y2}`;
}

/** Minuten seit Mitternacht -> "08:15" */
function formatMinutes(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Kleiner Status-/Hinweistext (lädt, leer …) */
function statusText(text) {
  const p = document.createElement("p");
  p.className = "status";
  p.textContent = text;
  return p;
}

/* --- Datums-Helfer: arbeiten mit Tagesschlüsseln "JJJJ-MM-TT" (Berliner Zeit) --- */

/** Berliner Kalendertag eines Zeitpunkts als sortierbarer String "JJJJ-MM-TT". */
function dayKey(date) {
  const parts = {};
  dayPartsFormat.formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Minuten seit Mitternacht (Berliner Zeit) eines Zeitpunkts. */
function minutesOfDay(date) {
  const parts = {};
  minutePartsFormat.formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Tagesschlüssel + n Tage (in UTC gerechnet, damit Zeitumstellungen nicht stören). */
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Tagesschlüssel -> Date um 12:00 UTC (sicher vor Zeitzonen-Verschiebungen). */
function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Montag der Woche, in der der Tag liegt. */
function weekStartOf(key) {
  const weekday = (keyToDate(key).getUTCDay() + 6) % 7; // Mo = 0 … So = 6
  return addDays(key, -weekday);
}

/** Kalenderwoche nach ISO 8601 (Woche mit dem ersten Donnerstag = KW 1). */
function isoWeek(key) {
  const thursday = keyToDate(addDays(weekStartOf(key), 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1, 12);
  return Math.floor((thursday - yearStart) / (7 * 24 * 3600 * 1000)) + 1;
}

/** "Dienstag, 14. Oktober" – mit Jahr, falls es nicht das aktuelle ist. */
function formatDayHeading(key, todayKey) {
  const options = { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" };
  if (key.slice(0, 4) !== todayKey.slice(0, 4)) options.year = "numeric";
  return keyToDate(key).toLocaleDateString("de-DE", options);
}

/** "14.10." */
function formatShortDate(key) {
  return keyToDate(key).toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

/* ---------- 5. Gemeinsame Helfer ---------- */

/** Lädt eine JSON-Datei und stellt sicher, dass sie ein Array enthält. */
async function fetchJsonArray(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} beim Laden von ${url}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${url} muss ein Array von Einträgen enthalten`);
  }
  return data;
}

/** Fehlermeldung inkl. Hinweis auf lokalen Server bei file:// */
function showLoadError(container, message) {
  container.replaceChildren();

  const box = document.createElement("div");
  box.className = "card status status-error";
  box.setAttribute("role", "alert");

  const msg = document.createElement("p");
  msg.textContent = message;
  box.append(msg);

  const hint = document.createElement("p");
  hint.append(
    "Hinweis: Wird die Seite lokal direkt als Datei (file://) geöffnet, blockiert der Browser fetch(). " +
    "Starte im Projektordner einen kleinen Server, z. B. "
  );
  const code = document.createElement("code");
  code.textContent = "python -m http.server";
  hint.append(code, ", und öffne dann http://localhost:8000.");
  box.append(hint);

  container.append(box);
}

