"""
Scryfall bulk data loader.

Downloads the 'default_cards' bulk file (~530 MB, all printings) once and caches
it to ./data/default-cards.json. Refreshes automatically if the file is older
than 24 hours.

Provides two lookup functions used by scanner.py:
  - lookup_card(name, set_code) -> dict | None
  - lookup_card_fuzzy(name, color, card_type) -> dict | None
"""

import json
import os
import time
import threading
import requests

CACHE_DIR = os.path.join(os.path.dirname(__file__), "data")
CACHE_FILE = os.path.join(CACHE_DIR, "default-cards.json")
CACHE_MAX_AGE = 86400  # 24 hours

SCRYFALL_HEADERS = {"User-Agent": "MTGScanner/1.0", "Accept": "application/json"}

# In-memory indices, built once at startup
# name_index:     lowercase name -> list of card dicts, sorted by usd price desc
# set_index:      (lowercase name, lowercase set code) -> card dict
_name_index: dict[str, list[dict]] = {}
_set_index: dict[tuple[str, str], dict] = {}
_index_ready = threading.Event()


def _download_bulk_data():
    """Download default_cards bulk file from Scryfall if missing or stale."""
    os.makedirs(CACHE_DIR, exist_ok=True)

    if os.path.exists(CACHE_FILE):
        age = time.time() - os.path.getmtime(CACHE_FILE)
        if age < CACHE_MAX_AGE:
            print(f"[bulk_data] Using cached file (age: {age/3600:.1f}h)")
            return

    print("[bulk_data] Fetching bulk data manifest...")
    r = requests.get("https://api.scryfall.com/bulk-data", headers=SCRYFALL_HEADERS, timeout=10)
    r.raise_for_status()
    items = r.json().get("data", [])
    download_url = next(
        (item["download_uri"] for item in items if item["type"] == "default_cards"),
        None,
    )
    if not download_url:
        raise RuntimeError("Could not find default_cards in bulk-data manifest")

    print(f"[bulk_data] Downloading {download_url} ...")
    with requests.get(download_url, headers=SCRYFALL_HEADERS, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        with open(CACHE_FILE, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    print(f"\r[bulk_data] {downloaded/1024/1024:.0f} / {total/1024/1024:.0f} MB", end="", flush=True)
    print(f"\n[bulk_data] Download complete.")


def _build_index():
    """Parse the cached JSON and build in-memory lookup indices."""
    print("[bulk_data] Building index...")
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        cards = json.load(f)

    name_idx: dict[str, list[dict]] = {}
    set_idx: dict[tuple[str, str], dict] = {}

    for card in cards:
        name = card.get("name", "")
        set_code = card.get("set", "")
        prices = card.get("prices", {})
        usd = float(prices.get("usd") or 0)
        usd_foil = float(prices.get("usd_foil") or 0)

        entry = {
            "name": name,
            "set": card.get("set_name", ""),
            "set_code": set_code,
            "price": max(usd, usd_foil),
            "usd": usd,
            "usd_foil": usd_foil,
            "foil_best": usd_foil > usd,
            "type_line": card.get("type_line", ""),
            "colors": card.get("colors", []),
            "color_identity": card.get("color_identity", []),
            "cmc": card.get("cmc", 0),
            "keywords": card.get("keywords", []),
            "oracle_text": card.get("oracle_text", ""),
        }

        key = name.lower()
        name_idx.setdefault(key, []).append(entry)

        if set_code:
            set_idx[(key, set_code.lower())] = entry

    # Sort each name's printings by price descending
    for key in name_idx:
        name_idx[key].sort(key=lambda c: c["price"], reverse=True)

    global _name_index, _set_index
    _name_index = name_idx
    _set_index = set_idx
    print(f"[bulk_data] Index ready: {len(_name_index):,} unique cards, {len(_set_index):,} printings")
    _index_ready.set()


def _refresh_loop():
    """Background thread: re-download and rebuild index every 24 hours."""
    while True:
        time.sleep(CACHE_MAX_AGE)
        print("[bulk_data] 24h refresh triggered...")
        try:
            _download_bulk_data()
            _build_index()
        except Exception as e:
            print(f"[bulk_data] Refresh failed: {e}")


def init():
    """Download (if needed), build the index, and start the auto-refresh thread."""
    _download_bulk_data()
    _build_index()
    t = threading.Thread(target=_refresh_loop, daemon=True)
    t.start()
    print("[bulk_data] Auto-refresh thread started (every 24h)")


def _name_similarity(a: str, b: str) -> float:
    a_words = set(a.lower().split())
    b_words = set(b.lower().split())
    if not a_words or not b_words:
        return 0.0
    return len(a_words & b_words) / max(len(a_words), len(b_words))


def lookup_card(name: str, set_code: str | None = None) -> dict | None:
    """
    Look up a card by name (and optionally set code).
    Returns the best matching card dict, or None.
    """
    _index_ready.wait()
    name_lower = name.lower()

    # 1. Exact set-specific match
    if set_code:
        entry = _set_index.get((name_lower, set_code.lower()))
        if entry:
            return {**entry, "fallback": False}

    # 2. Exact name match (highest price printing)
    if name_lower in _name_index:
        return {**_name_index[name_lower][0], "fallback": False}

    # 3. Fuzzy: find best name overlap >= 0.3
    best_score = 0.0
    best_entry = None
    for idx_name, entries in _name_index.items():
        score = _name_similarity(name, idx_name)
        if score > best_score:
            best_score = score
            best_entry = entries[0]

    if best_score >= 0.3 and best_entry:
        return {**best_entry, "fallback": False}

    return None


def lookup_card_fuzzy(name: str, color: str = "", card_type: str = "") -> dict | None:
    """
    Fallback lookup using word overlap + optional color/type filtering.
    Returns the highest-price match with similarity >= 0.2, marked fallback=True.
    """
    _index_ready.wait()

    color_upper = color.upper()
    card_type_lower = card_type.lower()

    best_score = 0.0
    best_entry = None

    for idx_name, entries in _name_index.items():
        score = _name_similarity(name, idx_name)
        if score < 0.2:
            continue
        candidate = entries[0]
        # Filter by color if provided
        if color_upper and color_upper not in ("M", "C"):
            card_colors = candidate.get("colors", [])
            if not any(color_upper == c for c in card_colors):
                continue
        # Filter by type if provided
        if card_type_lower:
            type_line = candidate.get("type_line", "").lower()
            if card_type_lower not in type_line:
                continue
        if score > best_score:
            best_score = score
            best_entry = candidate

    if best_entry:
        return {**best_entry, "fallback": True}

    return None
