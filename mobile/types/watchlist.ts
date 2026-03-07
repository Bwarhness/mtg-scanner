export interface WatchlistFilter {
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

export interface WatchlistRule {
  label: string;
  color: string;
  filters: WatchlistFilter;
}
