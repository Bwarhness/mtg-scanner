#!/usr/bin/env python3
"""
MTG Bulk Card Scanner
Scans an image of Magic: The Gathering cards, returns cards sorted by price,
and saves an annotated image showing where each card is in the pile.
Usage: python scan.py <image_path>
"""

import sys
import base64
import json
import os
import requests
from pathlib import Path
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont


PROMPT = """You are analyzing an image of Magic: The Gathering cards piled together.

Identify every card whose name you can read from the name bar (the text strip at the top of each card).
Include cards at an angle or partially hidden, as long as you are confident of the name.

For each card, return a JSON object with exactly two keys:
- "name": the card name as a string
- "box": the bounding box as [ymin, xmin, ymax, xmax], all integers from 0 to 1000

Strict rules:
- Return a single JSON array, one object per card
- Each card must be its own separate object — never merge two cards into one entry
- Use only the keys "name" and "box" — no other keys allowed
- No explanation, no markdown, no text outside the JSON array

Example output:
[
  {"name": "Counterspell", "box": [120, 50, 480, 350]},
  {"name": "Lightning Bolt", "box": [500, 200, 850, 600]}
]"""

MODEL = "google/gemini-3-flash-preview"


def get_cards(image_path: str) -> list[dict]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY environment variable not set.")
        sys.exit(1)

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

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
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{image_b64}"},
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )

    text = response.choices[0].message.content.strip()

    # Extract the JSON array (find first [ to last ])
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in model response")
    text = text[start:end]

    # Use json-repair to handle common LLM JSON formatting errors
    from json_repair import repair_json
    data = repair_json(text, return_objects=True)

    # Normalize: handle both "name" and "label" keys from the model
    results = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("label")
        box = item.get("box") or item.get("box_2d")
        if name and box:
            results.append({"name": name, "box": box})

    return results


def name_similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity between two card names."""
    a_words = set(a.lower().split())
    b_words = set(b.lower().split())
    if not a_words or not b_words:
        return 0.0
    return len(a_words & b_words) / max(len(a_words), len(b_words))


def lookup_price(name: str) -> dict | None:
    try:
        r = requests.get(
            "https://api.scryfall.com/cards/named",
            params={"fuzzy": name},
            timeout=5,
        )
        if r.status_code != 200:
            return None
        card = r.json()

        # Reject if the matched name is too different from what we asked for
        if name_similarity(name, card["name"]) < 0.3:
            return None

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
        }
    except Exception:
        return None


def price_color(price: float) -> tuple:
    if price >= 2.0:
        return (255, 50, 50)    # red — high value
    elif price >= 0.5:
        return (255, 200, 0)    # yellow — medium value
    else:
        return (100, 220, 100)  # green — low value


def annotate_image(image_path: str, results: list[dict], output_path: str):
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size

    try:
        font = ImageFont.truetype("arial.ttf", size=18)
        font_small = ImageFont.truetype("arial.ttf", size=14)
    except Exception:
        font = ImageFont.load_default()
        font_small = font

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

        # Draw box with thick border
        for offset in range(3):
            draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)

        # Label background
        label = f"{card['name']}  ${card['price']:.2f}"
        bbox = draw.textbbox((x1, y1), label, font=font)
        label_h = bbox[3] - bbox[1] + 4
        label_w = bbox[2] - bbox[0] + 6
        label_y = y1 - label_h - 2 if y1 > label_h + 2 else y2 + 2

        draw.rectangle([x1, label_y, x1 + label_w, label_y + label_h], fill=(0, 0, 0, 200))
        draw.text((x1 + 3, label_y + 2), label, fill=color, font=font)

    img.save(output_path)
    print(f"Annotated image saved to: {output_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scan.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    if not Path(image_path).exists():
        print(f"Error: File not found: {image_path}")
        sys.exit(1)

    print(f"Scanning {image_path}...")
    detected = get_cards(image_path)
    print(f"Detected {len(detected)} cards\n")

    # Filter out entries that look like card types rather than names
    TYPE_PREFIXES = ("Creature", "Sorcery", "Instant", "Enchantment", "Artifact", "Planeswalker", "Land", "Legendary")
    detected = [d for d in detected if not any(d["name"].startswith(t) for t in TYPE_PREFIXES)]

    print("Looking up prices on Scryfall...")
    results = []
    not_found = []

    for item in detected:
        name = item.get("name", "")
        card = lookup_price(name)
        if card:
            card["box"] = item.get("box")
            results.append(card)
        else:
            not_found.append(name)

    # Deduplicate by resolved card name (keep highest price entry)
    seen = {}
    for card in results:
        name = card["name"]
        if name not in seen or card["price"] > seen[name]["price"]:
            seen[name] = card
    results = list(seen.values())

    results.sort(key=lambda x: x["price"], reverse=True)

    print()
    print("=" * 60)
    print(f"  {'Card Name':<28} {'Price':>7}  Set")
    print("=" * 60)
    for card in results:
        foil = " (foil)" if card["foil_best"] else ""
        print(f"  {card['name']:<28} ${card['price']:>6.2f}{foil}  {card['set']}")

    if not_found:
        print()
        print(f"  Not found: {', '.join(not_found)}")

    total = sum(c["price"] for c in results)
    print("=" * 60)
    print(f"  {'Total estimated value:':<28} ${total:>6.2f}")
    print()

    # Save annotated image
    output_path = str(Path(image_path).with_stem(Path(image_path).stem + "_annotated").with_suffix(".jpg"))
    annotate_image(image_path, results, output_path)


if __name__ == "__main__":
    main()
