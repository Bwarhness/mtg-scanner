import { Link, Stack } from "expo-router";
import { View, Text } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a0a" }}>
        <Text style={{ color: "#fff", fontSize: 18, marginBottom: 16 }}>Screen not found.</Text>
        <Link href="/(tabs)/camera" style={{ color: "#00ddaa" }}>
          Go to Camera
        </Link>
      </View>
    </>
  );
}
