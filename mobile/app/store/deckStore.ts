import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Deck {
  id: string;
  name: string;
  cardNames: Set<string>; // lowercase for fast lookup
  rawText: string;
  createdAt: number;
}

// Serializable version for AsyncStorage
interface DeckSerialized {
  id: string;
  name: string;
  cardNames: string[];
  rawText: string;
  createdAt: number;
}

interface DeckState {
  decks: Deck[];
  activeDeckId: string | null;
  addDeck: (name: string, rawText: string) => void;
  removeDeck: (id: string) => void;
  setActiveDeck: (id: string | null) => void;
  loadDecks: () => Promise<void>;
  getActiveDeckCards: () => Set<string>;
}

const STORAGE_KEY = "decks";

export function parseDeckList(raw: string): string[] {
  const names: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
    // Match: "4 Lightning Bolt" or "4x Lightning Bolt" or "Lightning Bolt"
    // Also handle set codes: "4 Lightning Bolt (M11) 149"
    const match = trimmed.match(/^(?:\d+x?\s+)?([A-Za-z\s',\-/:\.!?]+?)(?:\s*\(.*)?$/);
    if (match) {
      const name = match[1].trim();
      if (name.length > 1) names.push(name);
    }
  }
  return names;
}

export const useDeckStore = create<DeckState>((set, get) => ({
  decks: [],
  activeDeckId: null,

  addDeck: async (name, rawText) => {
    const cardNames = parseDeckList(rawText);
    const deck: Deck = {
      id: Date.now().toString(),
      name,
      cardNames: new Set(cardNames.map((n) => n.toLowerCase())),
      rawText,
      createdAt: Date.now(),
    };
    const updated = [...get().decks, deck];
    set({ decks: updated, activeDeckId: deck.id });
    await _persist(updated);
  },

  removeDeck: async (id) => {
    const updated = get().decks.filter((d) => d.id !== id);
    const activeDeckId = get().activeDeckId === id
      ? (updated[0]?.id ?? null)
      : get().activeDeckId;
    set({ decks: updated, activeDeckId });
    await _persist(updated);
  },

  setActiveDeck: async (id) => {
    set({ activeDeckId: id });
    await AsyncStorage.setItem("activeDeckId", id ?? "");
  },

  loadDecks: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const activeId = await AsyncStorage.getItem("activeDeckId");
      if (raw) {
        const serialized: DeckSerialized[] = JSON.parse(raw);
        const decks = serialized.map((d) => ({
          ...d,
          cardNames: new Set(d.cardNames),
        }));
        set({ decks, activeDeckId: activeId || decks[0]?.id || null });
      }
    } catch {}
  },

  getActiveDeckCards: () => {
    const { decks, activeDeckId } = get();
    return decks.find((d) => d.id === activeDeckId)?.cardNames ?? new Set();
  },
}));

async function _persist(decks: Deck[]) {
  const serialized: DeckSerialized[] = decks.map((d) => ({
    ...d,
    cardNames: [...d.cardNames],
  }));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
}
