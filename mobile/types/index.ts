export interface Card {
  name: string;
  price: number;
  foil: boolean;
  set: string;
  fallback: boolean;
  box: [number, number, number, number];
  type_line: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  keywords: string[];
  oracle_text: string;
}

export interface ScanResult {
  cards: Card[];
  total: number;
  not_found: string[];
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
}
