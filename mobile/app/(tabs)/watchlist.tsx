import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──────────────────────────────────────────────────────────────

interface WatchlistFilters {
  type_contains?: string;
  type_contains_not?: string;
  colors_include?: string;
  colors_exact?: string;
  cmc_min?: number;
  cmc_max?: number;
  price_min?: number;
  price_max?: number;
  keywords_include?: string;
  name_contains?: string;
  oracle_contains?: string;
}

interface WatchlistRule {
  label: string;
  color: string;
  filters: WatchlistFilters;
}

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY = "watchlist";

const DEFAULT_WATCHLIST: WatchlistRule[] = [
  { label: "Zombies", color: "#00ddaa", filters: { type_contains: "Zombie" } },
  { label: "Dragons", color: "#ff6600", filters: { type_contains: "Dragon" } },
  { label: "Black cards", color: "#cc88ff", filters: { colors_include: "B" } },
  {
    label: "Cheap (CMC 1-2)",
    color: "#44aaff",
    filters: { cmc_max: 2, cmc_min: 1 },
  },
  {
    label: "Valuable (>$1)",
    color: "#ffdd00",
    filters: { price_min: 1.0 },
  },
  { label: "Flying", color: "#aaddff", filters: { keywords_include: "Flying" } },
];

const COLOR_PRESETS = [
  "#00ddaa",
  "#ff6600",
  "#cc88ff",
  "#44aaff",
  "#ffdd00",
  "#aaddff",
  "#ff4444",
  "#44dd88",
];

const MTG_COLORS = ["W", "U", "B", "R", "G"] as const;

// ── Helpers ────────────────────────────────────────────────────────────

function buildFilterSummary(filters: WatchlistFilters): string {
  const parts: string[] = [];
  if (filters.type_contains) parts.push(`type contains: ${filters.type_contains}`);
  if (filters.type_contains_not) parts.push(`type NOT: ${filters.type_contains_not}`);
  if (filters.colors_include) parts.push(`color: ${filters.colors_include}`);
  if (filters.colors_exact) parts.push(`exact color: ${filters.colors_exact}`);
  if (filters.cmc_min != null && filters.cmc_max != null)
    parts.push(`CMC ${filters.cmc_min}-${filters.cmc_max}`);
  else if (filters.cmc_min != null) parts.push(`CMC \u2265 ${filters.cmc_min}`);
  else if (filters.cmc_max != null) parts.push(`CMC \u2264 ${filters.cmc_max}`);
  if (filters.price_min != null && filters.price_max != null)
    parts.push(`$${filters.price_min.toFixed(2)}-$${filters.price_max.toFixed(2)}`);
  else if (filters.price_min != null) parts.push(`price \u2265 $${filters.price_min.toFixed(2)}`);
  else if (filters.price_max != null) parts.push(`price \u2264 $${filters.price_max.toFixed(2)}`);
  if (filters.keywords_include) parts.push(`keyword: ${filters.keywords_include}`);
  if (filters.name_contains) parts.push(`name: ${filters.name_contains}`);
  if (filters.oracle_contains) parts.push(`oracle: ${filters.oracle_contains}`);
  return parts.join(" | ") || "No filters";
}

function emptyRule(): WatchlistRule {
  return { label: "", color: COLOR_PRESETS[0], filters: {} };
}

// ── Component ──────────────────────────────────────────────────────────

export default function WatchlistScreen() {
  const [rules, setRules] = useState<WatchlistRule[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<WatchlistRule>(emptyRule());

  // ── Persistence ────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setRules(JSON.parse(raw));
        } else {
          setRules(DEFAULT_WATCHLIST);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WATCHLIST));
        }
      } catch {
        setRules(DEFAULT_WATCHLIST);
      }
    })();
  }, []);

  const persist = useCallback(async (updated: WatchlistRule[]) => {
    setRules(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  // ── Actions ────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditIndex(null);
    setDraft(emptyRule());
    setModalVisible(true);
  };

  const openEdit = (index: number) => {
    setEditIndex(index);
    setDraft(JSON.parse(JSON.stringify(rules[index])));
    setModalVisible(true);
  };

  const deleteRule = (index: number) => {
    const updated = rules.filter((_, i) => i !== index);
    persist(updated);
  };

  const handleSave = () => {
    if (!draft.label.trim()) {
      Alert.alert("Validation", "Label cannot be empty.");
      return;
    }
    const cleaned: WatchlistRule = {
      label: draft.label.trim(),
      color: draft.color,
      filters: { ...draft.filters },
    };
    // Remove empty string filters
    for (const key of Object.keys(cleaned.filters) as (keyof WatchlistFilters)[]) {
      const val = cleaned.filters[key];
      if (val === "" || val === undefined) {
        delete cleaned.filters[key];
      }
    }
    let updated: WatchlistRule[];
    if (editIndex != null) {
      updated = [...rules];
      updated[editIndex] = cleaned;
    } else {
      updated = [...rules, cleaned];
    }
    persist(updated);
    setModalVisible(false);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Watchlist",
      "Restore default watchlist rules? This will remove all custom rules.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => persist(DEFAULT_WATCHLIST),
        },
      ]
    );
  };

  // ── Draft helpers ──────────────────────────────────────────────────

  const setFilter = <K extends keyof WatchlistFilters>(
    key: K,
    value: WatchlistFilters[K]
  ) => {
    setDraft((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }));
  };

  const parseNum = (text: string): number | undefined => {
    if (text === "") return undefined;
    const n = parseFloat(text);
    return isNaN(n) ? undefined : n;
  };

  // ── Render ─────────────────────────────────────────────────────────

  const renderRule = ({
    item,
    index,
  }: {
    item: WatchlistRule;
    index: number;
  }) => (
    <TouchableOpacity
      style={styles.ruleRow}
      onPress={() => openEdit(index)}
      activeOpacity={0.7}
    >
      <View style={[styles.colorDot, { backgroundColor: item.color }]} />
      <View style={styles.ruleTextWrap}>
        <Text style={styles.ruleLabel}>{item.label}</Text>
        <Text style={styles.ruleSummary} numberOfLines={1}>
          {buildFilterSummary(item.filters)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => deleteRule(index)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.deleteIcon}>{"\u{1F5D1}"}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watchlist</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity onPress={handleReset} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={rules}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderRule}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No watchlist rules. Tap "+ Add" to create one.
          </Text>
        }
      />

      {/* Footer info */}
      <Text style={styles.footerInfo}>
        Cards matching these rules are highlighted in the Results tab
      </Text>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editIndex != null ? "Edit Rule" : "Add Rule"}
            </Text>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              {/* Label */}
              <Text style={styles.fieldLabel}>Label</Text>
              <TextInput
                style={styles.input}
                value={draft.label}
                onChangeText={(t) => setDraft((p) => ({ ...p, label: t }))}
                placeholder="Rule name"
                placeholderTextColor="#666"
              />

              {/* Color */}
              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorRow}>
                {COLOR_PRESETS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setDraft((p) => ({ ...p, color: c }))}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      draft.color === c && styles.colorCircleSelected,
                    ]}
                  />
                ))}
              </View>

              {/* Filters header */}
              <Text style={styles.sectionHeader}>
                Filters (all active filters must match)
              </Text>

              {/* Type contains */}
              <Text style={styles.fieldLabel}>Type contains</Text>
              <TextInput
                style={styles.input}
                value={draft.filters.type_contains ?? ""}
                onChangeText={(t) => setFilter("type_contains", t || undefined)}
                placeholder="e.g. Zombie"
                placeholderTextColor="#666"
              />

              {/* Type NOT contains */}
              <Text style={styles.fieldLabel}>Type NOT contains</Text>
              <TextInput
                style={styles.input}
                value={draft.filters.type_contains_not ?? ""}
                onChangeText={(t) =>
                  setFilter("type_contains_not", t || undefined)
                }
                placeholder="e.g. Legendary"
                placeholderTextColor="#666"
              />

              {/* Color includes */}
              <Text style={styles.fieldLabel}>Color includes</Text>
              <View style={styles.colorLetterRow}>
                {MTG_COLORS.map((c) => {
                  const active = draft.filters.colors_include === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() =>
                        setFilter("colors_include", active ? undefined : c)
                      }
                      style={[
                        styles.colorLetterBtn,
                        active && styles.colorLetterActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.colorLetterText,
                          active && styles.colorLetterTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* CMC min / max */}
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>CMC min</Text>
                  <TextInput
                    style={styles.input}
                    value={
                      draft.filters.cmc_min != null
                        ? String(draft.filters.cmc_min)
                        : ""
                    }
                    onChangeText={(t) => setFilter("cmc_min", parseNum(t))}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>CMC max</Text>
                  <TextInput
                    style={styles.input}
                    value={
                      draft.filters.cmc_max != null
                        ? String(draft.filters.cmc_max)
                        : ""
                    }
                    onChangeText={(t) => setFilter("cmc_max", parseNum(t))}
                    placeholder="10"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Price min / max */}
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Price min ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={
                      draft.filters.price_min != null
                        ? String(draft.filters.price_min)
                        : ""
                    }
                    onChangeText={(t) => setFilter("price_min", parseNum(t))}
                    placeholder="0.00"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Price max ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={
                      draft.filters.price_max != null
                        ? String(draft.filters.price_max)
                        : ""
                    }
                    onChangeText={(t) => setFilter("price_max", parseNum(t))}
                    placeholder="100.00"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Keyword includes */}
              <Text style={styles.fieldLabel}>Keyword includes</Text>
              <TextInput
                style={styles.input}
                value={draft.filters.keywords_include ?? ""}
                onChangeText={(t) =>
                  setFilter("keywords_include", t || undefined)
                }
                placeholder="e.g. Flying"
                placeholderTextColor="#666"
              />

              {/* Name contains */}
              <Text style={styles.fieldLabel}>Name contains</Text>
              <TextInput
                style={styles.input}
                value={draft.filters.name_contains ?? ""}
                onChangeText={(t) =>
                  setFilter("name_contains", t || undefined)
                }
                placeholder="e.g. Liliana"
                placeholderTextColor="#666"
              />

              {/* Oracle text contains */}
              <Text style={styles.fieldLabel}>Oracle text contains</Text>
              <TextInput
                style={styles.input}
                value={draft.filters.oracle_contains ?? ""}
                onChangeText={(t) =>
                  setFilter("oracle_contains", t || undefined)
                }
                placeholder="e.g. destroy target"
                placeholderTextColor="#666"
              />

              <View style={{ height: 24 }} />
            </ScrollView>

            {/* Bottom buttons */}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  headerBtns: {
    flexDirection: "row",
    gap: 10,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#555",
  },
  headerBtnText: {
    color: "#ccc",
    fontSize: 14,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#00ddaa",
  },
  addBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    padding: 14,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  ruleTextWrap: {
    flex: 1,
  },
  ruleLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  ruleSummary: {
    color: "#888",
    fontSize: 13,
    marginTop: 2,
  },
  deleteBtn: {
    paddingLeft: 12,
  },
  deleteIcon: {
    fontSize: 18,
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
  footerInfo: {
    color: "#555",
    textAlign: "center",
    fontSize: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  modalScroll: {
    maxHeight: "75%",
  },
  fieldLabel: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 4,
    marginTop: 10,
  },
  sectionHeader: {
    color: "#00ddaa",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#1e1e1e",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#333",
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    flexWrap: "wrap",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorCircleSelected: {
    borderColor: "#fff",
    borderWidth: 3,
  },
  colorLetterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  colorLetterBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#333",
  },
  colorLetterActive: {
    backgroundColor: "#00ddaa",
    borderColor: "#00ddaa",
  },
  colorLetterText: {
    color: "#ccc",
    fontSize: 16,
    fontWeight: "bold",
  },
  colorLetterTextActive: {
    color: "#000",
  },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  modalBtns: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#ccc",
    fontSize: 16,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#00ddaa",
    alignItems: "center",
  },
  saveBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
});
