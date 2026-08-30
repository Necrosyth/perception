"""NL query parsing for semantic search (Stage 7).

Turns free text like "man in red shirt near loading dock after 10pm" into
``{structured_filters, semantic_text}``. The API applies the structured filters
first (camera/zone/label/time), then vector similarity inside the narrowed set.

Two backends behind one seam:

- **local** (default): a deterministic, fully-offline extractor. Fits the edge
  box (no API key, no cloud) and is what the shipped demo uses.
- **llm**: when ``AINA_NL_PARSER=llm`` and ``AINA_NL_LLM_URL`` are set, a small
  JSON-mode LLM call produces the same struct; any failure falls back to local.

Both output a ``ParsedQuery`` dataclass; the retrieval code never sees which
backend ran.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("aina.api.nl")

UTC = timezone.utc

# -- catalog shapes --------------------------------------------------------- #
@dataclass
class Catalogs:
    cameras: list[str] = field(default_factory=list)
    zones: list[str] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)


@dataclass
class ParsedQuery:
    camera: str | None = None
    zone: str | None = None
    label: str | None = None
    event_type: str | None = None
    time_from: datetime | None = None
    time_to: datetime | None = None
    semantic_text: str = ""
    matched: list[str] = field(default_factory=list)

    def json(self) -> dict:
        return {
            "camera": self.camera,
            "zone": self.zone,
            "label": self.label,
            "event": self.event_type,
            "time_from": self.time_from.isoformat() if self.time_from else None,
            "time_to": self.time_to.isoformat() if self.time_to else None,
            "semantic_text": self.semantic_text,
            "matched": self.matched,
        }


# -- label/event keyword tables --------------------------------------------- #
LABEL_KEYWORDS: list[tuple[str, str]] = [
    ("person", "person"),
    ("people", "person"),
    ("man", "person"),
    ("woman", "person"),
    ("pedestrian", "person"),
    ("bicyclist", "bicycle"),
    ("bike", "bicycle"),
    ("cyclist", "bicycle"),
    ("motorcyclist", "motorcycle"),
    ("motorbike", "motorcycle"),
    ("vehicle", "car"),
    ("car", "car"),
    ("automobile", "car"),
    ("truck", "truck"),
    ("lorry", "truck"),
    ("van", "truck"),
    ("bus", "bus"),
    ("boat", "boat"),
    ("forklift", "forklift"),
    ("pallet", "pallet"),
    ("box", "box"),
    ("crate", "box"),
    ("dog", "dog"),
    ("cat", "cat"),
    ("fire hydrant", "fire hydrant"),
    ("bird", "bird"),
]

EVENT_KEYWORDS: list[tuple[str, str]] = [
    ("loitering", "loitering"),
    ("loiter", "loitering"),
    ("loitered", "loitering"),
    ("loiters", "loitering"),
    ("alert", "alert"),
]

STOPWORDS = {
    "a", "an", "the", "and", "or", "with", "on", "at", "of", "in", "for", "near",
    "by", "that", "who", "is", "was", "are", "were", "showing", "shows", "show",
    "red", "blue", "green", "black", "white", "grey", "gray", "yellow", "orange",
    "brown", "colored", "colours", "color", "shirt", "jacket", "coat", "hat",
    "high", "visibility", "hi-vis", "vest", "from", "to", "tracked", "objects",
    "object", "any", "all", "camera", "cameras",
}

_CLOCK = re.compile(r"(?P<hour>\d{1,2})(?::(?P<min>\d{2}))?\s*(?P<ampm>am|pm)\b", re.I)
_CLOCK24 = re.compile(r"(\d{1,2}):(\d{2})\b")


def parse_nl(query: str, catalogs: Catalogs, now: datetime | None = None) -> ParsedQuery:
    """Parse a free-text query into structured filters + semantic text."""
    now = now or datetime.now(UTC)
    if os.environ.get("AINA_NL_PARSER", "local").lower() == "llm" and os.environ.get("AINA_NL_LLM_URL"):
        try:
            return _llm_parse(query, catalogs, now)
        except Exception as exc:  # noqa: BLE001 - LLM is a bonus, never a gate
            logger.warning("LLM NL parser failed (%s) — falling back to local", exc)
    return _local_parse(query, catalogs, now)


def _local_parse(query: str, catalogs: Catalogs, now: datetime) -> ParsedQuery:
    text = query.strip()
    out = ParsedQuery()

    text, t_from, t_to = _extract_time(text, now)
    out.time_from, out.time_to = t_from, t_to

    for name, word in _catalog_tokens(catalogs.cameras):
        if _contains_word(text, word):
            text = _remove_phrase(text, word)
            out.camera = name
            out.matched.append(f"camera={name}")

    for name, word in _catalog_tokens(catalogs.zones):
        if _contains_word(text, word):
            text = _remove_phrase(text, word)
            out.zone = name
            out.matched.append(f"zone={name}")

    for word, canonical in LABEL_KEYWORDS:
        if _contains_word(text, word):
            text = _remove_phrase(text, word)
            out.label = canonical
            out.matched.append(f"label={canonical}")
            break

    for word, canonical in EVENT_KEYWORDS:
        if _contains_word(text, word):
            text = _remove_phrase(text, word)
            out.event_type = canonical
            out.matched.append(f"event={canonical}")
            break

    tokens = _tokens_of(text)
    meaningful = [tok for tok in tokens if tok not in STOPWORDS and not _is_clock(tok)]
    out.semantic_text = " ".join(meaningful)
    return out


# -- camera/zone matching ---------------------------------------------------- #
def _catalog_tokens(names: list[str]) -> list[tuple[str, str]]:
    """Return (canonical_name, matchable_word) pairs, longest first."""
    words = []
    for name in names:
        word = name.strip().lower().replace("-", "").replace("_", " ")
        for variant in {name.lower(), word, name.strip().lower()}:
            words.append((name, variant))
    return sorted(set(words), key=lambda pair: -len(pair[1]))


def _contains_word(text: str, word: str) -> bool:
    return re.search(rf"(?i)\b{re.escape(word)}\b", text) is not None


def _remove_phrase(text: str, word: str) -> str:
    return re.sub(rf"(?i)\b{re.escape(word)}\b", " ", text)


def _tokens_of(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z][a-zA-Z0-9_-]*", text.lower())


def _is_clock(tok: str) -> bool:
    m = _CLOCK.match(tok) or _CLOCK24.match(tok)
    return bool(m)


# -- time extraction --------------------------------------------------------- #
def _extract_time(text: str, now: datetime):
    text, t_from, t_to = _between_window(text, now)
    if t_from is not None and t_to is not None:
        return text, t_from, t_to
    text, t_from, t_to = _after_before(text, now)
    if t_from is not None or t_to is not None:
        return text, t_from, t_to
    text, t_from, t_to = _relative_window(text, now)
    if t_from is not None or t_to is not None:
        return text, t_from, t_to
    text, t_from, t_to = _day_keywords(text, now)
    return text, t_from, t_to


def _clock_of(match: re.Match, day: datetime) -> datetime:
    hour = int(match.group("hour")) % 24
    minute = int(match.group("min") or 0)
    if match.group("ampm"):
        ampm = match.group("ampm").lower()
        if ampm == "pm" and hour < 12:
            hour += 12
        if ampm == "am" and hour == 12:
            hour = 0
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _between_window(text: str, now: datetime) -> tuple[str, datetime | None, datetime | None]:
    m = re.search(
        r"\b(?:between|from)\s+(?P<a>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:and|to|until|-)\s*(?P<b>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b",
        text,
        re.I,
    )
    if not m:
        return text, None, None
    day = now.date()
    a = m.group("a")
    b = m.group("b")
    text = _remove_phrase(text, m.group(0))
    t_a = _parse_clock(a, day)
    t_b = _parse_clock(b, day)
    if t_b <= t_a:
        t_b += timedelta(days=1)  # "between 10pm and 2am"
    return text, t_a, t_b


def _parse_clock(value: str, day):
    m = _CLOCK.match(value)
    if not m:
        return None
    d = datetime(day.year, day.month, day.day, tzinfo=UTC, second=0, microsecond=0)
    return _clock_of(m, d)


def _after_before(text: str, now: datetime) -> tuple[str, datetime | None, datetime | None]:
    day = now.date()
    t_from = t_to = None
    clock = r"\d{1,2}(?::\d{2})?\s*(?:am|pm)?"

    m = re.search(rf"\b(?:after|since|from)\s+({clock})\b", text, re.I)
    if m:
        t_from = _parse_clock(m.group(1), day)
        text = _remove_phrase(text, m.group(0))

    m = re.search(rf"\b(?:before|until|by)\s+({clock})\b", text, re.I)
    if m:
        t_to = _parse_clock(m.group(1), day)
        text = _remove_phrase(text, m.group(0))
    return text, t_from, t_to


def _relative_window(text: str, now: datetime) -> tuple[str, datetime | None, datetime | None]:
    m = re.search(
        r"\b(?:last|past)\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?)\b", text, re.I
    )
    if m:
        n = int(m.group(1))
        unit = m.group(2).lower().rstrip("s")
        span = {
            "minute": timedelta(minutes=n),
            "min": timedelta(minutes=n),
            "hour": timedelta(hours=n),
            "hr": timedelta(hours=n),
            "day": timedelta(days=n),
            "week": timedelta(weeks=n),
        }[unit]
        text = _remove_phrase(text, m.group(0))
        return text, now - span, None
    return text, None, None


def _day_keywords(text: str, now: datetime) -> tuple[str, datetime | None, datetime | None]:
    day = now.date()
    yesterday = day - timedelta(days=1)
    for keyword, (start, end) in {
        "this morning": (_morn_lo(day), _morn_hi(day)),
        "morning": (_morn_lo(day), _morn_hi(day)),
        "this afternoon": (_afternoon_lo(day), _afternoon_hi(day)),
        "afternoon": (_afternoon_lo(day), _afternoon_hi(day)),
        "this evening": (_evening_lo(day), _evening_hi(day)),
        "evening": (_evening_lo(day), _evening_hi(day)),
        "last night": (_night_lo(yesterday), _night_hi(day)),
        "tonight": (_night_lo(day), _night_hi(day)),
        "today": (_day_lo(day), _day_hi(day)),
        "yesterday": (_day_lo(yesterday), _day_hi(yesterday)),
    }.items():
        if _contains_word(text, keyword):
            text = _remove_phrase(text, keyword)
            return text, start, end
    return text, None, None


def _at(d: object, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hour, minute, 0, tzinfo=UTC)


def _day_lo(d: object):
    return _at(d, 0)


def _day_hi(d: object):
    return _at(d, 23, 59)


def _morn_lo(d: object):
    return _at(d, 6)


def _morn_hi(d: object):
    return _at(d, 11, 59)


def _afternoon_lo(d: object):
    return _at(d, 12)


def _afternoon_hi(d: object):
    return _at(d, 16, 59)


def _evening_lo(d: object):
    return _at(d, 17)


def _evening_hi(d: object):
    return _at(d, 20, 59)


def _night_lo(d: object):
    return _at(d, 21)


def _night_hi(d: object):
    return _at(d, 5, 59)  # spans into next day


# -- LLM backend ------------------------------------------------------------ #
def _llm_parse(query: str, catalogs: Catalogs, now: datetime) -> ParsedQuery:
    import json
    import urllib.request

    prompt = {
        "model": os.environ.get("AINA_NL_LLM_MODEL", ""),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You convert surveillance search queries into JSON. "
                    "Reply with ONLY JSON: "
                    '{"camera": str|null (one of ' + json.dumps(catalogs.cameras) + '), '
                    '"zone": str|null (one of ' + json.dumps(catalogs.zones) + '), '
                    '"label": str|null (one of ' + json.dumps(catalogs.labels) + '), '
                    '"event_type": str|null, '
                    '"time_from": ISO-8601 or null, "time_to": ISO-8601 or null, '
                    '"semantic_text": str (remaining descriptive text), '
                    '"now": "' + now.isoformat() + '"}. Match names loosely '
                    "(e.g. 'loading dock' -> camera 'loading_dock')."
                ),
            },
            {"role": "user", "content": f"Query: {query}"},
        ],
    }
    req = urllib.request.Request(
        os.environ["AINA_NL_LLM_URL"],
        data=json.dumps(prompt).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    content = content[content.find("{") : content.rfind("}") + 1]
    data = json.loads(content)
    return ParsedQuery(
        camera=data.get("camera") or None,
        zone=data.get("zone") or None,
        label=data.get("label") or None,
        event_type=data.get("event_type") or None,
        time_from=_parse_iso(data.get("time_from")),
        time_to=_parse_iso(data.get("time_to")),
        semantic_text=str(data.get("semantic_text") or "").strip(),
        matched=["parsed by LLM"],
    )


def _parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None