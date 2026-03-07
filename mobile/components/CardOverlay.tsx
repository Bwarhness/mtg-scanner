import React, { useState, useCallback } from "react";
import { View, Image, Text, LayoutChangeEvent } from "react-native";
import { Card } from "../types";
import { WatchlistRule } from "../types/watchlist";
import { useDeckStore } from "../app/store/deckStore";

interface CardOverlayProps {
  cards: Card[];
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  selectedCard: string | null;
  watchlistMatches: Map<string, WatchlistRule[]>;
  onLayout?: (w: number, h: number) => void;
}

function getPriceColor(price: number): string {
  if (price >= 2.0) return "#ff3232";
  if (price >= 0.5) return "#ffc800";
  return "#64dc64";
}

export default function CardOverlay({
  cards,
  imageUri,
  imageWidth,
  imageHeight,
  selectedCard,
  watchlistMatches,
  onLayout,
}: CardOverlayProps) {
  const [displayW, setDisplayW] = useState(0);
  const [displayH, setDisplayH] = useState(0);
  const activeDeckCards = useDeckStore((s) => s.getActiveDeckCards());

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const containerW = e.nativeEvent.layout.width;
      if (imageWidth > 0 && imageHeight > 0) {
        const aspect = imageWidth / imageHeight;
        const h = containerW / aspect;
        setDisplayW(containerW);
        setDisplayH(h);
        onLayout?.(containerW, h);
      }
    },
    [imageWidth, imageHeight, onLayout]
  );

  return (
    <View onLayout={handleLayout} style={{ width: "100%", position: "relative" }}>
      <Image
        source={{ uri: imageUri }}
        style={{ width: "100%", height: displayH || undefined, aspectRatio: imageWidth / imageHeight }}
        resizeMode="contain"
      />
      {displayW > 0 && displayH > 0 && (() => {
        // Find selected card's pixel bounds for the spotlight
        const selectedCardData = selectedCard
          ? cards.find((c) => c.name === selectedCard)
          : null;
        const spotlight = selectedCardData
          ? {
              x1: (selectedCardData.box[1] / 1000) * displayW,
              y1: (selectedCardData.box[0] / 1000) * displayH,
              x2: (selectedCardData.box[3] / 1000) * displayW,
              y2: (selectedCardData.box[2] / 1000) * displayH,
            }
          : null;

        // Render non-selected cards first, selected card last (on top)
        const sorted = [...cards].sort((a, b) =>
          a.name === selectedCard ? 1 : b.name === selectedCard ? -1 : 0
        );

        return (
          <>
            {/* Spotlight dim: 4 rectangles around the selected card */}
            {spotlight && (
              <>
                {/* top */}
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: displayW, height: spotlight.y1, backgroundColor: "rgba(0,0,0,0.65)" }} />
                {/* bottom */}
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: spotlight.y2, width: displayW, height: displayH - spotlight.y2, backgroundColor: "rgba(0,0,0,0.65)" }} />
                {/* left */}
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: spotlight.y1, width: spotlight.x1, height: spotlight.y2 - spotlight.y1, backgroundColor: "rgba(0,0,0,0.65)" }} />
                {/* right */}
                <View pointerEvents="none" style={{ position: "absolute", left: spotlight.x2, top: spotlight.y1, width: displayW - spotlight.x2, height: spotlight.y2 - spotlight.y1, backgroundColor: "rgba(0,0,0,0.65)" }} />
              </>
            )}

            {sorted.map((card, i) => {
              const [ymin, xmin, ymax, xmax] = card.box;
              const x1 = (xmin / 1000) * displayW;
              const y1 = (ymin / 1000) * displayH;
              const x2 = (xmax / 1000) * displayW;
              const y2 = (ymax / 1000) * displayH;
              const w = x2 - x1;
              const h = y2 - y1;
              const priceColor = getPriceColor(card.price);
              const boxColor = card.fallback ? "#ff9600" : priceColor;
              const isSelected = selectedCard === card.name;
              const isNeeded = activeDeckCards.has(card.name.toLowerCase());
              const rules = watchlistMatches.get(card.name) || [];

              return (
                <View
                  key={`${card.name}-${i}`}
                  style={{
                    position: "absolute",
                    left: x1,
                    top: y1,
                    width: w,
                    height: h,
                    borderColor: isSelected ? "#ffffff" : boxColor,
                    borderWidth: 3,
                    borderStyle: card.fallback ? "dashed" : "solid",
                  }}
                >
                  {/* Price label */}
                  <View
                    style={{
                      position: "absolute",
                      top: -20,
                      left: 0,
                      backgroundColor: isSelected ? "#ffffff" : boxColor,
                      paddingHorizontal: 3,
                      paddingVertical: 1,
                      borderRadius: 2,
                    }}
                  >
                    <Text style={{ color: "#000", fontSize: 9, fontWeight: "bold" }} numberOfLines={1}>
                      {card.fallback ? "? " : ""}{card.name} ${card.price.toFixed(2)}
                    </Text>
                  </View>
                  {/* NEED badge */}
                  {isNeeded && (
                    <View style={{ position: "absolute", top: -20, right: 0, backgroundColor: "#ffd700", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 }}>
                      <Text style={{ color: "#000", fontSize: 9, fontWeight: "bold" }}>NEED</Text>
                    </View>
                  )}
                  {/* Watchlist dots */}
                  {rules.length > 0 && (
                    <View style={{ position: "absolute", top: -8, left: 0, flexDirection: "row", gap: 2 }}>
                      {rules.map((rule, ri) => (
                        <View key={ri} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: rule.color }} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        );
      })()}
    </View>
  );
}
