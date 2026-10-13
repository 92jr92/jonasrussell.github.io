/* =========================================================
   Persönliche Webseite – Script
   1. Light/Night Mode   (initTheme)
   2. Barrierefreie Tabs (initTabs)
   3. News aus JSON      (loadNews, renderNews, createNewsCard)
   ========================================================= */

"use strict";

/* Pfad zur News-Datei – relativ, damit es lokal und auf GitHub Pages läuft */
const NEWS_URL = "assets/news.json";
const THEME_KEY = "theme";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  loadNews();
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
    const response = await fetch(NEWS_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} beim Laden von ${NEWS_URL}`);
    }
    const items = await response.json();
    if (!Array.isArray(items)) {
      throw new Error("news.json muss ein Array von Einträgen enthalten");
    }
    renderNews(container, items);
  } catch (error) {
    console.warn("News konnten nicht geladen werden:", error);
    showNewsError(container);
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

/** Fehlermeldung inkl. Hinweis auf lokalen Server bei file:// */
function showNewsError(container) {
  container.replaceChildren();

  const box = document.createElement("div");
  box.className = "card status status-error";
  box.setAttribute("role", "alert");

  const msg = document.createElement("p");
  msg.textContent = "Die News konnten leider nicht geladen werden.";
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
