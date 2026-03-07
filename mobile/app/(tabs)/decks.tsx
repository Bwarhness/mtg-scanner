import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeckStore, parseDeckList } from "../store/deckStore";

export default function DecksScreen() {
  const { decks, activeDeckId, addDeck, removeDeck, setActiveDeck, loadDecks } = useDeckStore();
  const [adding, setAdding] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckText, setDeckText] = useState("");

  useEffect(() => {
    loadDecks();
  }, []);

  const handleAdd = () => {
    const name = deckName.trim() || "My Deck";
    const cards = parseDeckList(deckText);
    if (cards.length === 0) {
      Alert.alert("No cards found", "Paste a decklist with card names.");
      return;
    }
    addDeck(name, deckText);
    setDeckName("");
    setDeckText("");
    setAdding(false);
  };

  if (adding) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#222" }}>
            <TouchableOpacity onPress={() => setAdding(false)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>New Deck</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>Deck name</Text>
            <TextInput
              value={deckName}
              onChangeText={setDeckName}
              placeholder="e.g. Mono Red Burn"
              placeholderTextColor="#555"
              style={{
                backgroundColor: "#1a1a1a",
                color: "#fff",
                borderRadius: 8,
                padding: 12,
                fontSize: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#333",
              }}
            />

            <Text style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>
              Paste decklist (from Moxfield, Archidekt, Arena, MTGO, etc.)
            </Text>
            <TextInput
              value={deckText}
              onChangeText={setDeckText}
              placeholder={"4 Lightning Bolt\n4 Goblin Guide\n2 Searing Blaze\n// Sideboard\n3 Smash to Smithereens"}
              placeholderTextColor="#555"
              multiline
              style={{
                backgroundColor: "#1a1a1a",
                color: "#fff",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                minHeight: 240,
                borderWidth: 1,
                borderColor: "#333",
                textAlignVertical: "top",
              }}
            />
            {deckText.length > 0 && (
              <Text style={{ color: "#555", fontSize: 12, marginTop: 8 }}>
                {parseDeckList(deckText).length} cards parsed
              </Text>
            )}
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "#222" }}>
            <TouchableOpacity
              onPress={handleAdd}
              style={{
                backgroundColor: "#00ddaa",
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 16 }}>Save Deck</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#222" }}>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "bold" }}>Decks</Text>
        <TouchableOpacity onPress={() => setAdding(true)}>
          <Ionicons name="add-circle-outline" size={28} color="#00ddaa" />
        </TouchableOpacity>
      </View>

      {decks.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="layers-outline" size={64} color="#333" />
          <Text style={{ color: "#555", fontSize: 16, textAlign: "center", marginTop: 16 }}>
            No decks yet.{"\n"}Add a deck to highlight cards you need when scanning.
          </Text>
          <TouchableOpacity
            onPress={() => setAdding(true)}
            style={{ backgroundColor: "#00ddaa", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 24 }}
          >
            <Text style={{ color: "#000", fontWeight: "bold", fontSize: 15 }}>Add Deck</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={{ color: "#555", fontSize: 12, paddingHorizontal: 16, paddingTop: 10 }}>
            Active deck is highlighted during scans
          </Text>
          <FlatList
            data={decks}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => {
              const isActive = item.id === activeDeckId;
              return (
                <TouchableOpacity
                  onPress={() => setActiveDeck(isActive ? null : item.id)}
                  style={{
                    backgroundColor: isActive ? "rgba(0,221,170,0.1)" : "#1a1a1a",
                    borderRadius: 10,
                    padding: 14,
                    borderWidth: 2,
                    borderColor: isActive ? "#00ddaa" : "#222",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>{item.name}</Text>
                    <Text style={{ color: "#555", fontSize: 12, marginTop: 2 }}>
                      {item.cardNames.size} cards
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {isActive && (
                      <View style={{ backgroundColor: "#00ddaa", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                        <Text style={{ color: "#000", fontSize: 11, fontWeight: "bold" }}>ACTIVE</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert("Delete deck", `Remove "${item.name}"?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => removeDeck(item.id) },
                        ])
                      }
                    >
                      <Ionicons name="trash-outline" size={20} color="#555" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
}
