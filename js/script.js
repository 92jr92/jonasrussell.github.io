/* =========================================================
   Persönliche Webseite – Script
   1. Light/Night Mode   (initTheme)
   2. Barrierefreie Tabs (initTabs)
   3. News aus JSON      (loadNews, renderNews, createNewsCard)
   4. Termine aus JSON   (loadTermine, renderTermine, createTerminCard)
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

/* ---------- 4. Termine ---------- */

/*
 * assets/termine.json wird von der GitHub Action (scripts/ics_to_json.py)
 * alle 3 Stunden aus dem Kalender erzeugt. Format pro Termin:
 *   { title, start, end, allDay, location }  – start/end als ISO 8601 mit Offset,
 *   bei ganztägigen Terminen ist "end" exklusiv (00:00 des Folgetags).
 *
 * Alle Datums- und Zeitangaben werden in Europe/Berlin dargestellt –
 * unabhängig von der Zeitzone des Besuchers.
 */
const TIME_ZONE = "Europe/Berlin";

// Formatter einmal anlegen statt bei jedem Termin neu
const dayPartsFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit",
});

/** Lädt die Termine und rendert sie gruppiert nach Tag. */
async function loadTermine() {
  const container = document.getElementById("termine-list");
  if (!container) return;

  try {
    renderTermine(container, await fetchJsonArray(TERMINE_URL), new Date());
  } catch (error) {
    console.warn("Termine konnten nicht geladen werden:", error);
    showLoadError(container, "Die Termine konnten leider nicht geladen werden.");
  }
}

/**
 * Bereitet die Rohdaten auf: ungültige Einträge und Termine, die vor heute
 * endeten, fallen weg. Jeder Termin bekommt den Tag (dayKey), unter dem er
 * angezeigt wird – mehrtägige Termine, die schon laufen, erscheinen unter "Heute".
 */
function prepareTermine(items, now) {
  const todayKey = dayKey(now);

  return items
    .map((item) => {
      if (!item || typeof item.title !== "string") return null;
      const start = new Date(item.start);
      let end = new Date(item.end);
      if (Number.isNaN(start.getTime())) return null;
      if (Number.isNaN(end.getTime()) || end < start) end = start;

      // Letzter belegter Tag: Ende ist exklusiv, daher 1 ms abziehen
      const lastDayKey = dayKey(end > start ? new Date(end.getTime() - 1) : end);
      if (lastDayKey < todayKey) return null;

      const startKey = dayKey(start);
      return {
        title: item.title,
        start,
        end,
        lastDayKey,
        allDay: item.allDay === true,
        location: typeof item.location === "string" ? item.location.trim() : "",
        dayKey: startKey < todayKey ? todayKey : startKey,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, "de"));
}

/** Rendert die Termine als Tagesgruppen mit Karten. */
function renderTermine(container, items, now) {
  const termine = prepareTermine(items, now);
  container.replaceChildren();

  if (termine.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "Keine anstehenden Termine.";
    container.append(empty);
    return;
  }

  // Nach Tag gruppieren (Reihenfolge bleibt durch die Sortierung erhalten)
  const groups = new Map();
  termine.forEach((termin) => {
    if (!groups.has(termin.dayKey)) groups.set(termin.dayKey, []);
    groups.get(termin.dayKey).push(termin);
  });

  const todayKey = dayKey(now);
  const tomorrowKey = addDays(todayKey, 1);

  groups.forEach((dayTermine, key) => {
    const section = document.createElement("section");
    section.className = "termine-day";

    const heading = document.createElement("h3");
    heading.className = "termine-day-heading";
    heading.textContent = formatDayHeading(key, todayKey);

    // "Heute" / "Morgen" als hervorgehobenes Etikett vor dem Datum
    const relative = key === todayKey ? "Heute" : key === tomorrowKey ? "Morgen" : "";
    if (relative) {
      const badge = document.createElement("span");
      badge.className = key === todayKey ? "badge" : "badge badge-soft";
      badge.textContent = relative;
      heading.prepend(badge, " ");
    }

    const list = document.createElement("div");
    list.className = "termine-day-list";
    dayTermine.forEach((termin) => list.append(createTerminCard(termin, now)));

    section.append(heading, list);
    container.append(section);
  });
}

/** Baut eine Karte mit Uhrzeit, Titel und (falls vorhanden) Raum. */
function createTerminCard(termin, now) {
  const card = document.createElement("article");
  card.className = "card termin-card";

  // Beendet = Ende erreicht; Termine ohne Dauer (z. B. Abgabefristen) ab ihrem Beginn
  const hasDuration = termin.end > termin.start;
  const isPast = hasDuration ? termin.end <= now : termin.start <= now;
  const isRunning = !isPast && termin.start <= now;
  if (isPast) card.classList.add("is-past");
  if (isRunning) card.classList.add("is-now");

  // Zeile 1: Uhrzeit (bzw. "Ganztägig") + Status
  const time = document.createElement("p");
  time.className = "termin-time";
  const timeEl = document.createElement("time");
  timeEl.dateTime = termin.start.toISOString();
  timeEl.textContent = formatTimeRange(termin);
  time.append(timeEl);

  if (isRunning || isPast) {
    const state = document.createElement("span");
    state.className = isRunning ? "badge" : "badge badge-soft";
    state.textContent = isRunning ? "Läuft gerade" : "Beendet";
    time.append(" ", state);
  }

  // Zeile 2: Titel
  const title = document.createElement("h4");
  title.textContent = termin.title;
  card.append(time, title);

  // Zeile 3: Raum – entfällt, wenn kein Ort eingetragen ist
  if (termin.location) {
    const room = document.createElement("p");
    room.className = "termin-room";

    const label = document.createElement("span");
    label.className = "visually-hidden";
    label.textContent = "Raum: ";

    const text = document.createElement("span");
    text.textContent = termin.location;

    room.append(createPinIcon(), label, text);
    card.append(room);
  }

  return card;
}

/** "08:15–09:45 Uhr", "Ganztägig", über Mitternacht mit Enddatum. */
function formatTimeRange(termin) {
  const startKey = dayKey(termin.start);

  if (termin.allDay) {
    return termin.lastDayKey === startKey
      ? "Ganztägig"
      : `Ganztägig bis ${formatShortDate(termin.lastDayKey)}`;
  }

  const from = timeFormat.format(termin.start);
  const to = timeFormat.format(termin.end);
  if (termin.end.getTime() === termin.start.getTime()) return `${from} Uhr`;
  if (dayKey(termin.end) !== startKey) {
    return `${from} Uhr – ${formatShortDate(dayKey(termin.end))}, ${to} Uhr`;
  }
  return `${from}–${to} Uhr`;
}

/** Ort-Symbol (Stecknadel) als Inline-SVG, für Screenreader ausgeblendet. */
function createPinIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z");
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", "12");
  dot.setAttribute("cy", "9.5");
  dot.setAttribute("r", "2.5");

  svg.append(path, dot);
  return svg;
}

/* --- Datums-Helfer: arbeiten mit Tagesschlüsseln "JJJJ-MM-TT" (Berliner Zeit) --- */

/** Berliner Kalendertag eines Zeitpunkts als sortierbarer String "JJJJ-MM-TT". */
function dayKey(date) {
  const parts = {};
  dayPartsFormat.formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
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

