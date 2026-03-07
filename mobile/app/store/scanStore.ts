import { create } from "zustand";
import { ScanResult } from "../../types";

interface ScanState {
  results: ScanResult | null;
  isScanning: boolean;
  backendUrl: string;
  setResults: (results: ScanResult | null) => void;
  setScanning: (scanning: boolean) => void;
  setBackendUrl: (url: string) => void;
  clearResults: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  results: null,
  isScanning: false,
  backendUrl: "https://mtgscannerbackend.biggestblackest.dk",
  setResults: (results) => set({ results }),
  setScanning: (isScanning) => set({ isScanning }),
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  clearResults: () => set({ results: null }),
}));
