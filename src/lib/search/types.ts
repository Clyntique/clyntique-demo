export type SearchCategory =
  | "navigation"
  | "projects"
  | "creatives"
  | "evidence"
  | "knowledge"
  | "policies";

export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
  iconName?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SearchCategoryGroup {
  category: SearchCategory;
  label: string;
  items: SearchResultItem[];
}

export interface SearchResponse {
  query: string;
  totalHits: number;
  groups: SearchCategoryGroup[];
  durationMs: number;
}
