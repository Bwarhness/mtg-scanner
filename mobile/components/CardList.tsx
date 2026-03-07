import React, { useCallback, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { Card } from "../types";
import { WatchlistRule } from "../types/watchlist";

interface CardListProps {
  cards: Card[];
  selectedCardName: string | null;
  onSelectCard: (name: string | null) => void;
  watchlistMatches: Map<string, WatchlistRule[]>;
  notFound: string[];
}

function getPriceColor(price: number): string {
  if (price >= 2.0) return "#ff3232";
  if (price >= 0.5) return "#ffc800";
  return "#64dc64";
}

export default function CardList({
  cards,
  selectedCardName,
  onSelectCard,
  watchlistMatches,
  notFound,
}: CardListProps) {
  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => b.price - a.price),
    [cards]
  );

  const total = useMemo(
    () => cards.reduce((sum, c) => sum + c.price, 0),
    [cards]
  );

  const handlePress = useCallback(
    (name: string) => {
      onSelectCard(selectedCardName === name ? null : name);
    },
    [selectedCardName, onSelectCard]
  );

  const renderCard = useCallback(
    ({ item }: { item: Card }) => {
      const isSelected = selectedCardName === item.name;
      const priceColor = getPriceColor(item.price);
      const rules = watchlistMatches.get(item.name) || [];

      return (
        <TouchableOpacity
          onPress={() => handlePress(item.name)}
          style={{
            backgroundColor: isSelected ? "#2a2a2a" : item.fallback ? "rgba(255,150,0,0.08)" : "transparent",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#222",
            borderLeftWidth: item.fallback ? 3 : 0,
            borderLeftColor: "#ff9600",
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: "#888", fontSize: 11 }}>{item.set}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {item.fallback && (
                  <View
                    style={{
                      backgroundColor: "#ff9600",
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                      borderRadius: 3,
                    }}
                  >
                    <Text style={{ color: "#000", fontSize: 9, fontWeight: "bold" }}>GUESSED</Text>
                  </View>
                )}
                {item.foil && (
                  <View
                    style={{
                      backgroundColor: "#6a5acd",
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 3,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 9, fontWeight: "bold" }}>FOIL</Text>
                  </View>
                )}
                <Text style={{ color: priceColor, fontWeight: "bold", fontSize: 14 }}>
                  ${item.price.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
          {rules.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {rules.map((rule, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: rule.color,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: "#000", fontSize: 10, fontWeight: "bold" }}>
                    {rule.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [selectedCardName, watchlistMatches, handlePress]
  );

  return (
    <FlatList
      data={sortedCards}
      keyExtractor={(item, index) => `${item.name}-${index}`}
      renderItem={renderCard}
      ListFooterComponent={
        <View>
          {notFound.length > 0 && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: "#666", fontStyle: "italic", fontSize: 12, marginBottom: 4 }}>
                Not found:
              </Text>
              {notFound.map((name, i) => (
                <Text key={i} style={{ color: "#555", fontStyle: "italic", fontSize: 12 }}>
                  {name}
                </Text>
              ))}
            </View>
          )}
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: "#333",
              flexDirection: "row",
              justifyContent: "flex-end",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
              Total: ${total.toFixed(2)}
            </Text>
          </View>
        </View>
      }
    />
  );
}
