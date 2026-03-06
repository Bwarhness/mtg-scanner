#!/usr/bin/env python3
"""
MTG Bulk Card Scanner v2
- Captures color + type alongside card name for smarter Scryfall fallback search
- Cards identified via fallback are marked with a dashed border on the annotated image
Usage: python scan_v2.py <image_path>
"""

import sys
import base64
import json
import os
import re
import requests
from pathlib import Path
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont
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
    # Already a valid code like "B", "WU", "M"
    if all(c in "WUBRGMC" for c in raw):
        return raw
    # Word form
    return COLOR_MAP.get(raw.lower(), raw[:1].upper())


def get_cards(image_path: str) -> list[dict]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY environment variable not set.")
        sys.exit(1)

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)

    suffix = Path(image_path).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    mime_type = mime_map.get(suffix, "image/jpeg")
    image_b64 = base64.b64encode(Path(image_path).read_bytes()).decode()

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
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
    """Build a Scryfall search query from partial name + color + type."""
    parts = []
    # Add each word from the partial name
    for word in name.split():
        if len(word) > 2:
            parts.append(f'name:"{word}"')
    if color and color != "M":
        parts.append(f"c:{color.lower()}")
    if card_type:
        parts.append(f"t:{card_type}")
    return " ".join(parts)


def lookup_price(name: str, color: str = "", card_type: str = "") -> dict | None:
    """Try fuzzy name match first; fall back to color+type+partial name search."""

    # --- Primary: fuzzy name match ---
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

    # --- Fallback: search with color + type + partial name words ---
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
            # Pick the first result that still shares at least one word with our query
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
    }


def price_color(price: float) -> tuple:
    if price >= 2.0:
        return (255, 50, 50)
    elif price >= 0.5:
        return (255, 200, 0)
    else:
        return (100, 220, 100)


def draw_dashed_rect(draw, x1, y1, x2, y2, color, dash=12, width=2):
    """Draw a dashed rectangle to indicate fallback identification."""
    for i, (sx, sy, ex, ey) in enumerate([
        (x1, y1, x2, y1),  # top
        (x2, y1, x2, y2),  # right
        (x2, y2, x1, y2),  # bottom
        (x1, y2, x1, y1),  # left
    ]):
        dx, dy = ex - sx, ey - sy
        length = (dx**2 + dy**2) ** 0.5
        if length == 0:
            continue
        ux, uy = dx / length, dy / length
        pos = 0
        drawing = True
        while pos < length:
            seg_end = min(pos + dash, length)
            if drawing:
                draw.line(
                    [sx + ux * pos, sy + uy * pos, sx + ux * seg_end, sy + uy * seg_end],
                    fill=color, width=width,
                )
            pos = seg_end
            drawing = not drawing


def annotate_image(image_path: str, results: list[dict], output_path: str):
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size

    try:
        font = ImageFont.truetype("arial.ttf", size=18)
    except Exception:
        font = ImageFont.load_default()

    for card in results:
        box = card.get("box")
        if not box or len(box) != 4:
            continue

        ymin, xmin, ymax, xmax = box
        x1 = int(xmin * w / 1000)
        y1 = int(ymin * h / 1000)
        x2 = int(xmax * w / 1000)
        y2 = int(ymax * h / 1000)

        color = price_color(card["price"])

        if card.get("fallback"):
            draw_dashed_rect(draw, x1, y1, x2, y2, color, dash=10, width=2)
        else:
            for offset in range(3):
                draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)

        foil = " (foil)" if card["foil_best"] else ""
        fallback_tag = " ~" if card.get("fallback") else ""
        label = f"{card['name']}  ${card['price']:.2f}{foil}{fallback_tag}"

        bbox = draw.textbbox((x1, y1), label, font=font)
        label_h = bbox[3] - bbox[1] + 4
        label_w = bbox[2] - bbox[0] + 6
        label_y = y1 - label_h - 2 if y1 > label_h + 2 else y2 + 2

        draw.rectangle([x1, label_y, x1 + label_w, label_y + label_h], fill=(0, 0, 0))
        draw.text((x1 + 3, label_y + 2), label, fill=color, font=font)

    img.save(output_path)
    print(f"Annotated image saved to: {output_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scan_v2.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    if not Path(image_path).exists():
        print(f"Error: File not found: {image_path}")
        sys.exit(1)

    print(f"Scanning {image_path}...")
    detected = get_cards(image_path)
    print(f"Detected {len(detected)} cards\n")

    print("Looking up prices on Scryfall...")
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

    print()
    print("=" * 65)
    print(f"  {'Card Name':<28} {'Price':>7}  {'How':<9}  Set")
    print("=" * 65)
    for card in results:
        foil = " (foil)" if card["foil_best"] else ""
        how = "fallback" if card["fallback"] else "direct"
        print(f"  {card['name']:<28} ${card['price']:>6.2f}{foil:<7}  {how:<9}  {card['set']}")

    if not_found:
        print()
        print(f"  Not found: {', '.join(not_found)}")

    total = sum(c["price"] for c in results)
    print("=" * 65)
    print(f"  {'Total estimated value:':<28} ${total:>6.2f}")
    print(f"\n  ~ = identified via color+type fallback search")
    print()

    output_path = str(Path(image_path).with_stem(Path(image_path).stem + "_annotated_v2").with_suffix(".jpg"))
    annotate_image(image_path, results, output_path)

    # Save results JSON for compare.html
    json_out = {
        "version": "v2",
        "cards": [{"name": c["name"], "price": c["price"], "foil": c["foil_best"], "set": c["set"], "fallback": c.get("fallback", False), "box": c.get("box")} for c in results],
        "total": round(total, 2),
    }
    json_path = Path(__file__).parent / "results_v2.json"
    json_path.write_text(json.dumps(json_out, indent=2))
    print(f"Results saved to: {json_path}")


if __name__ == "__main__":
    main()
