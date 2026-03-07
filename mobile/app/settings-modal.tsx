import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useScanStore } from "./store/scanStore";

export default function SettingsModal() {
  const { backendUrl, setBackendUrl } = useScanStore();
  const [url, setUrl] = useState(backendUrl);

  const handleSave = () => {
    setBackendUrl(url.trim());
    router.back();
  };

  return (
    <View className="flex-1 bg-[#0a0a0a] p-6">
      <Text className="text-gray-400 text-sm mb-2">
        Backend URL (e.g. http://192.168.1.200:8000)
      </Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.200:8000"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        className="bg-[#1a1a1a] text-white p-4 rounded-xl text-base border border-[#333] mb-6"
      />
      <TouchableOpacity
        onPress={handleSave}
        className="bg-[#00ddaa] py-4 rounded-xl items-center"
      >
        <Text className="text-black text-base font-bold">Save</Text>
      </TouchableOpacity>
    </View>
  );
}
