import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useDeckStore } from "./store/deckStore";

export default function RootLayout() {
  const loadDecks = useDeckStore((s) => s.loadDecks);
  useEffect(() => { loadDecks(); }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0a0a0a" },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="settings-modal"
          options={{
            presentation: "modal",
            headerShown: true,
            headerTitle: "Settings",
            headerStyle: { backgroundColor: "#1a1a1a" },
            headerTintColor: "#ffffff",
          }}
        />
      </Stack>
    </>
  );
}
