#!/usr/bin/env python3
"""
Wandelt einen iCalendar-Kalender (.ics) in assets/termine.json um.

Quelle (eine von beiden):
  - Umgebungsvariable CALENDAR_URL (in der GitHub Action aus dem Secret), oder
  - --file pfad/zur/datei.ics      (zum lokalen Testen)

Ausgabe: JSON-Array mit den Terminen von heute 00:00 bis +28 Tage
(Zeitzone Europe/Berlin), sortiert nach Startzeit. Felder pro Termin:
  title, start, end (ISO 8601 mit Offset), allDay (bool), location (str)

Ganztägige Termine: start = Tagesbeginn 00:00, end = exklusives Ende
(00:00 des Folgetags), wie im iCalendar-Standard.

Sicherheit: Die Kalender-URL wird nie ausgegeben – auch nicht in
Fehlermeldungen. Bei Abruf- oder Parse-Fehlern bricht das Skript mit
Exit-Code 1 ab, ohne die bestehende JSON-Datei anzufassen.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

TZ = ZoneInfo("Europe/Berlin")
DAYS_AHEAD = 28
TIMEOUT_SECONDS = 30
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "termine.json"


class CalendarError(Exception):
    """Fehler mit einer Meldung, die gefahrlos ausgegeben werden kann (ohne URL)."""


# ---------- Laden ----------

def fetch_calendar(url: str) -> bytes:
    """Lädt die .ics-Datei. webcal:// wird durch https:// ersetzt."""
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]

    # Bewusst nur Statuscode bzw. Fehlertyp ausgeben: Ausnahmetexte (z. B. ValueError,
    # http.client.InvalidURL) können die vollständige URL enthalten.
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "termine-sync/1.0"})
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read()
    except urllib.error.HTTPError as err:
        raise CalendarError(f"Kalender-Abruf fehlgeschlagen: HTTP {err.code}") from None
    except urllib.error.URLError as err:
        reason = "Verbindungsfehler" if isinstance(err.reason, str) else type(err.reason).__name__
        raise CalendarError(f"Kalender-Abruf fehlgeschlagen: {reason}") from None
    except Exception as err:
        raise CalendarError(f"Kalender-Abruf fehlgeschlagen: {type(err).__name__}") from None


def read_source(args: argparse.Namespace) -> bytes:
    """Liest die Kalenderdaten aus --file oder aus CALENDAR_URL."""
    if args.file:
        try:
            return Path(args.file).read_bytes()
        except OSError as err:
            raise CalendarError(f"Datei konnte nicht gelesen werden: {err.strerror}") from None

    url = os.environ.get("CALENDAR_URL", "").strip()
    if not url:
        raise CalendarError("Keine Quelle: Umgebungsvariable CALENDAR_URL ist leer und --file fehlt.")
    return fetch_calendar(url)


def parse_calendar(data: bytes) -> icalendar.Calendar:
    """Parst die .ics-Daten; prüft grob, ob es wirklich ein Kalender ist."""
    if b"BEGIN:VCALENDAR" not in data[:2048].upper():
        raise CalendarError("Antwort ist keine iCalendar-Datei (BEGIN:VCALENDAR fehlt).")
    try:
        return icalendar.Calendar.from_ical(data)
    except Exception as err:  # icalendar wirft je nach Fehler unterschiedliche Typen
        raise CalendarError(f"Kalender konnte nicht geparst werden: {type(err).__name__}") from None


# ---------- Umwandeln ----------

def to_berlin(value: date | datetime) -> datetime:
    """
    Normalisiert einen DTSTART/DTEND-Wert auf eine Uhrzeit in Europe/Berlin.
    - reines Datum (ganztägig)  -> 00:00 Uhr in Berlin
    - "floating" (ohne Zone)    -> als Berliner Ortszeit interpretiert
    - mit Zone (z. B. UTC)      -> nach Berlin umgerechnet
    """
    if not isinstance(value, datetime):
        return datetime.combine(value, time.min, tzinfo=TZ)
    if value.tzinfo is None:
        return value.replace(tzinfo=TZ)
    return value.astimezone(TZ)


def text_field(event: icalendar.Event, name: str) -> str:
    """Liest ein Textfeld (SUMMARY, LOCATION …) – leerer String, wenn es fehlt."""
    value = event.get(name)
    return str(value).strip() if value is not None else ""


def convert_event(event: icalendar.Event) -> dict | None:
    """Wandelt ein (bereits aufgelöstes) VEVENT in ein Dictionary um."""
    if text_field(event, "STATUS").upper() == "CANCELLED":
        return None

    dtstart = event.get("DTSTART")
    if dtstart is None:
        return None  # ohne Beginn nicht darstellbar
    start_raw = dtstart.dt
    all_day = not isinstance(start_raw, datetime)
    start = to_berlin(start_raw)

    # Ende: DTEND, sonst DURATION, sonst Standard (ganztägig: +1 Tag, sonst = Beginn)
    if event.get("DTEND") is not None:
        end = to_berlin(event.get("DTEND").dt)
    elif event.get("DURATION") is not None:
        end = start + event.get("DURATION").dt
    else:
        end = start + timedelta(days=1) if all_day else start
    if end < start:
        end = start

    return {
        "title": text_field(event, "SUMMARY") or "(ohne Titel)",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "allDay": all_day,
        "location": text_field(event, "LOCATION"),
    }


def build_events(calendar: icalendar.Calendar, today: date) -> list[dict]:
    """Löst Wiederholungen (RRULE, EXDATE, RDATE) im Zeitfenster auf und sortiert."""
    window_start = datetime.combine(today, time.min, tzinfo=TZ)
    window_end = window_start + timedelta(days=DAYS_AHEAD)

    try:
        occurrences = recurring_ical_events.of(calendar).between(window_start, window_end)
    except Exception as err:
        raise CalendarError(f"Wiederkehrende Termine konnten nicht aufgelöst werden: {type(err).__name__}") from None

    events = [e for e in (convert_event(o) for o in occurrences) if e is not None]
    # Sortierung nach echtem Zeitpunkt (nicht nach String), bei Gleichstand nach Titel
    events.sort(key=lambda e: (datetime.fromisoformat(e["start"]), e["title"]))
    return events


# ---------- Schreiben ----------

def write_json_atomic(events: list[dict], output: Path) -> None:
    """
    Schreibt erst in eine temporäre Datei und ersetzt dann das Ziel.
    So bleibt die alte Datei bei einem Fehler garantiert unverändert.
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=output.parent, prefix=".termine-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as tmp:
            json.dump(events, tmp, ensure_ascii=False, indent=2)
            tmp.write("\n")
        os.replace(tmp_path, output)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="iCalendar (.ics) -> assets/termine.json")
    parser.add_argument("--file", help="lokale .ics-Datei statt CALENDAR_URL verwenden")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="Zieldatei (Standard: assets/termine.json)")
    args = parser.parse_args()

    try:
        calendar = parse_calendar(read_source(args))
        events = build_events(calendar, datetime.now(TZ).date())
        write_json_atomic(events, args.output)
    except CalendarError as err:
        print(f"FEHLER: {err} – {args.output.name} wurde nicht verändert.", file=sys.stderr)
        return 1

    print(f"{len(events)} Termin(e) in {args.output.name} geschrieben.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
