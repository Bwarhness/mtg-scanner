import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScanStore } from "../store/scanStore";
import { WatchlistRule } from "../../types/watchlist";
import { getWatchlistMatches } from "../../lib/watchlistEngine";
import CardOverlay from "../../components/CardOverlay";
import CardList from "../../components/CardList";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const OVERLAY_HEIGHT = SCREEN_HEIGHT * 0.4;

export default function ResultsScreen() {
  const router = useRouter();
  const results = useScanStore((s) => s.results);
  const clearResults = useScanStore((s) => s.clearResults);

  const [selectedCardName, setSelectedCardName] = useState<string | null>(null);
  const [watchlistRules, setWatchlistRules] = useState<WatchlistRule[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem("watchlist").then((raw) => {
      if (raw) {
        try {
          setWatchlistRules(JSON.parse(raw));
        } catch {}
      }
    });
  }, [results]);

  const watchlistMatches = useMemo(() => {
    if (!results?.cards || watchlistRules.length === 0) {
      return new Map<string, WatchlistRule[]>();
    }
    return getWatchlistMatches(results.cards, watchlistRules);
  }, [results?.cards, watchlistRules]);

  const ruleHitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rules of watchlistMatches.values()) {
      for (const rule of rules) {
        counts.set(rule.label, (counts.get(rule.label) || 0) + 1);
      }
    }
    return counts;
  }, [watchlistMatches]);

  const handleScanAgain = useCallback(() => {
    clearResults();
    setSelectedCardName(null);
    setDismissedAlerts(new Set());
    router.navigate("/(tabs)/camera");
  }, [clearResults, router]);

  const dismissAlert = useCallback((label: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(label));
  }, []);

  if (!results) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ color: "#888", fontSize: 18, textAlign: "center", marginBottom: 16 }}>
            Take a photo to scan cards
          </Text>
          <TouchableOpacity
            onPress={() => router.navigate("/(tabs)/camera")}
            style={{
              backgroundColor: "#00ddaa",
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#000", fontWeight: "bold", fontSize: 16 }}>Go to Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const total = results.cards.reduce((sum, c) => sum + c.price, 0);

  const alertBanners: { label: string; color: string; count: number }[] = [];
  for (const rule of watchlistRules) {
    const count = ruleHitCounts.get(rule.label);
    if (count && count > 0 && !dismissedAlerts.has(rule.label)) {
      alertBanners.push({ label: rule.label, color: rule.color, count });
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      {/* Watchlist alert banners */}
      {alertBanners.length > 0 && (
        <View>
          {alertBanners.map((alert) => (
            <TouchableOpacity
              key={alert.label}
              onPress={() => dismissAlert(alert.label)}
              style={{
                backgroundColor: alert.color,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 13 }}>
                {alert.count} {alert.label} found!
              </Text>
              <Text style={{ color: "#000", fontSize: 16, fontWeight: "bold" }}>x</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Card overlay */}
      <View style={{ height: OVERLAY_HEIGHT, backgroundColor: "#000" }}>
        <ScrollView
          contentContainerStyle={{ justifyContent: "center", minHeight: "100%" }}
          bounces={false}
        >
          <CardOverlay
            cards={results.cards}
            imageUri={results.imageUri}
            imageWidth={results.imageWidth}
            imageHeight={results.imageHeight}
            selectedCard={selectedCardName}
            watchlistMatches={watchlistMatches}
          />
        </ScrollView>
      </View>

      {/* Card list */}
      <View style={{ flex: 1 }}>
        <CardList
          cards={results.cards}
          selectedCardName={selectedCardName}
          onSelectCard={setSelectedCardName}
          watchlistMatches={watchlistMatches}
          notFound={results.not_found}
        />
      </View>

      {/* Bottom bar */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#1a1a1a",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: "#333",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
          Total: ${total.toFixed(2)}
        </Text>
        <TouchableOpacity
          onPress={handleScanAgain}
          style={{
            backgroundColor: "#00ddaa",
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#000", fontWeight: "bold", fontSize: 14 }}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
