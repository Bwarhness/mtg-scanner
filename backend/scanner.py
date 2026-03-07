"""
MTG Card Scanner - refactored from scan_v2.py to accept image bytes.
"""

import base64
import json
import os
import re
import requests
from openai import OpenAI
from json_repair import repair_json


PROMPT = """You are analyzing an image of Magic: The Gathering cards piled together.

Identify every card whose name you can read from the name bar (the text strip at the top of each card).
Include cards at an angle or partially hidden, as long as you are reasonably confident.

For each card, return a JSON object with exactly these keys:
- "name": the card name as a string (include whatever text you can read from the name bar)
- "color": the card's color as a single letter or combination: W (white), U (blue), B (black), R (red), G (green), M (multicolor), C (colorless/artifact)
- "type": the card's primary type as a lowercase string: creature, sorcery, instant, enchantment, artifact, planeswalker, or land
- "box": the bounding box as [ymin, xmin, ymax, xmax], all integers from 0 to 1000

Strict rules:
- Return a single JSON array, one object per card
- Each card must be its own separate object — never merge two cards into one entry
- Use only the keys "name", "color", "type", and "box" — no other keys
- No explanation, no markdown, no text outside the JSON array

Example output:
[
  {"name": "Counterspell", "color": "U", "type": "instant", "box": [120, 50, 480, 350]},
  {"name": "Cabal Minion", "color": "B", "type": "creature", "box": [500, 200, 850, 600]}
]"""

MODEL = "google/gemini-3-flash-preview"

COLOR_MAP = {
    "white": "W", "blue": "U", "black": "B", "red": "R", "green": "G",
    "multicolor": "M", "multi": "M", "colorless": "C", "artifact": "C",
    "gold": "M",
}

TYPE_PREFIXES = ("Creature", "Sorcery", "Instant", "Enchantment", "Artifact", "Planeswalker", "Land", "Legendary")


def normalize_color(raw: str) -> str:
    if not raw:
        return ""
    raw = raw.strip().upper()
    if all(c in "WUBRGMC" for c in raw):
        return raw
    return COLOR_MAP.get(raw.lower(), raw[:1].upper())


def get_cards(image_bytes: bytes, content_type: str = "image/jpeg") -> list[dict]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable not set")

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)

    image_b64 = base64.b64encode(image_bytes).decode()

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{image_b64}"}},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )

    text = response.choices[0].message.content.strip()
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in model response")
    text = text[start:end]
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)

    data = repair_json(text, return_objects=True)

    results = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("label")
        box = item.get("box") or item.get("box_2d")
        color = normalize_color(item.get("color", ""))
        card_type = (item.get("type") or "").lower().strip()
        if name and box and not any(name.startswith(t) for t in TYPE_PREFIXES):
            results.append({"name": name, "color": color, "type": card_type, "box": box})

    return results


def name_similarity(a: str, b: str) -> float:
    a_words = set(a.lower().split())
    b_words = set(b.lower().split())
    if not a_words or not b_words:
        return 0.0
    return len(a_words & b_words) / max(len(a_words), len(b_words))


def build_scryfall_query(name: str, color: str, card_type: str) -> str:
    parts = []
    for word in name.split():
        if len(word) > 2:
            parts.append(f'name:"{word}"')
    if color and color != "M":
        parts.append(f"c:{color.lower()}")
    if card_type:
        parts.append(f"t:{card_type}")
    return " ".join(parts)


def lookup_price(name: str, color: str = "", card_type: str = "") -> dict | None:
    # Primary: fuzzy name match
    try:
        r = requests.get(
            "https://api.scryfall.com/cards/named",
            params={"fuzzy": name},
            timeout=5,
        )
        if r.status_code == 200:
            card = r.json()
            if name_similarity(name, card["name"]) >= 0.3:
                return _card_result(card, fallback=False)
    except Exception:
        pass

    # Fallback: search with color + type + partial name words
    if not color and not card_type:
        return None

    try:
        query = build_scryfall_query(name, color, card_type)
        if not query:
            return None
        r = requests.get(
            "https://api.scryfall.com/cards/search",
            params={"q": query, "order": "usd", "dir": "desc"},
            timeout=5,
        )
        if r.status_code == 200:
            data = r.json()
            cards = data.get("data", [])
            for candidate in cards:
                if name_similarity(name, candidate["name"]) >= 0.2:
                    return _card_result(candidate, fallback=True)
    except Exception:
        pass

    return None


def _card_result(card: dict, fallback: bool) -> dict:
    prices = card.get("prices", {})
    usd = float(prices.get("usd") or 0)
    usd_foil = float(prices.get("usd_foil") or 0)
    return {
        "name": card["name"],
        "price": max(usd, usd_foil),
        "usd": usd,
        "usd_foil": usd_foil,
        "set": card.get("set_name", ""),
        "foil_best": usd_foil > usd,
        "fallback": fallback,
        "type_line": card.get("type_line", ""),
        "colors": card.get("colors", []),
        "color_identity": card.get("color_identity", []),
        "cmc": card.get("cmc", 0),
        "keywords": card.get("keywords", []),
        "oracle_text": card.get("oracle_text", ""),
    }


def scan_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """Main entry point: detect cards and look up prices. Returns API response dict."""
    detected = get_cards(image_bytes, content_type)

    results = []
    not_found = []

    for item in detected:
        card = lookup_price(item["name"], item.get("color", ""), item.get("type", ""))
        if card:
            card["box"] = item.get("box")
            results.append(card)
        else:
            not_found.append(item["name"])

    # Deduplicate by resolved card name
    seen = {}
    for card in results:
        name = card["name"]
        if name not in seen or card["price"] > seen[name]["price"]:
            seen[name] = card
    results = list(seen.values())
    results.sort(key=lambda x: x["price"], reverse=True)

    total = sum(c["price"] for c in results)

    cards_out = []
    for c in results:
        cards_out.append({
            "name": c["name"],
            "price": c["price"],
            "foil": c["foil_best"],
            "set": c["set"],
            "fallback": c.get("fallback", False),
            "box": c.get("box"),
            "type_line": c.get("type_line", ""),
            "colors": c.get("colors", []),
            "color_identity": c.get("color_identity", []),
            "cmc": c.get("cmc", 0),
            "keywords": c.get("keywords", []),
            "oracle_text": c.get("oracle_text", ""),
        })

    return {
        "cards": cards_out,
        "total": round(total, 2),
        "not_found": not_found,
    }
