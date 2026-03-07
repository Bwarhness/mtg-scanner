import { Card } from "../types";
import { WatchlistRule, WatchlistFilter } from "../types/watchlist";

function checkFilter(card: Card, key: keyof WatchlistFilter, value: unknown): boolean {
  switch (key) {
    case "type_contains":
      return card.type_line.toLowerCase().includes((value as string).toLowerCase());
    case "type_contains_not":
      return !card.type_line.toLowerCase().includes((value as string).toLowerCase());
    case "colors_include":
      return (
        card.colors.includes(value as string) ||
        card.color_identity.includes(value as string)
      );
    case "colors_exact":
      return (
        JSON.stringify([...card.color_identity].sort()) ===
        JSON.stringify([...(value as string).split("")].sort())
      );
    case "cmc_min":
      return card.cmc >= (value as number);
    case "cmc_max":
      return card.cmc <= (value as number);
    case "price_min":
      return card.price >= (value as number);
    case "price_max":
      return card.price <= (value as number);
    case "keywords_include":
      return card.keywords
        .map((k) => k.toLowerCase())
        .includes((value as string).toLowerCase());
    case "name_contains":
      return card.name.toLowerCase().includes((value as string).toLowerCase());
    case "oracle_contains":
      return (card.oracle_text || "")
        .toLowerCase()
        .includes((value as string).toLowerCase());
    default:
      return true;
  }
}

export function matchesRule(card: Card, rule: WatchlistRule): boolean {
  const entries = Object.entries(rule.filters) as [keyof WatchlistFilter, unknown][];
  if (entries.length === 0) return false;
  return entries.every(
    ([key, value]) => value !== undefined && value !== "" && checkFilter(card, key, value)
  );
}

export function getWatchlistMatches(
  cards: Card[],
  rules: WatchlistRule[]
): Map<string, WatchlistRule[]> {
  const matches = new Map<string, WatchlistRule[]>();
  for (const card of cards) {
    const matchingRules = rules.filter((rule) => matchesRule(card, rule));
    if (matchingRules.length > 0) {
      matches.set(card.name, matchingRules);
    }
  }
  return matches;
}
