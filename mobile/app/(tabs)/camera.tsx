import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useScanStore } from "../store/scanStore";

export default function CameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { isScanning, backendUrl, setResults, setScanning } = useScanStore();

  // Auto-request permission on mount
  useEffect(() => {
    if (permission !== null && !permission.granted && !permission.canAskAgain === false) {
      requestPermission();
    }
  }, [permission]);

  if (!permission || !permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#555" />
        <Text style={styles.permissionText}>
          Camera access is required to scan MTG cards
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleScan = async () => {
    if (!cameraRef.current || isScanning) return;

    try {
      setScanning(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
      });

      if (!photo) {
        Alert.alert("Error", "Failed to capture photo");
        setScanning(false);
        return;
      }

      const formData = new FormData();
      formData.append("image", {
        uri: photo.uri,
        type: "image/jpeg",
        name: "scan.jpg",
      } as unknown as Blob);

      const response = await fetch(`${backendUrl}/scan`, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      setResults({
        cards: data.cards ?? [],
        total: data.total ?? 0,
        not_found: data.not_found ?? [],
        imageUri: photo.uri,
        imageWidth: photo.width,
        imageHeight: photo.height,
      });

      setScanning(false);
      router.replace("/(tabs)/results");
    } catch (error: unknown) {
      setScanning(false);
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      Alert.alert("Scan Failed", message);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>MTG Scanner</Text>
          <TouchableOpacity onPress={() => router.push("/settings-modal")}>
            <Ionicons name="settings-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Scanning overlay */}
        {isScanning && (
          <View style={styles.scanningOverlay}>
            <ActivityIndicator size="large" color="#00ddaa" />
            <Text style={styles.scanningText}>Scanning cards...</Text>
          </View>
        )}

        {/* Scan button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={handleScan}
            disabled={isScanning}
            style={[styles.scanButton, { opacity: isScanning ? 0.5 : 1 }]}
          >
            <Ionicons name="scan" size={36} color="#000" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  camera: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanningText: {
    color: "#fff",
    fontSize: 18,
    marginTop: 16,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  scanButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#00ddaa",
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
    shadowColor: "#00ddaa",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#00ddaa",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
});
