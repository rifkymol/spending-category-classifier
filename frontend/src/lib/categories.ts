// The categories and groups, from categories.json. That file is generated from
// backend/classifier/categories.py by backend/scripts/export_categories.py (a backend test checks it
// is up to date), so the frontend never keeps a second, hand-written list. The backend serves the
// same data at GET /api/categories; the frontend uses the build-time copy, which ships with it.
import data from "./categories.json";

export type GroupKey = "needs" | "wants" | "transfers";
export type BucketKey = "needs" | "wants" | "savings" | "other";

export interface CategoryInfo {
  key: string;
  group: GroupKey;
  bucket: BucketKey;
  color: string;
  name_en: string;
  name_id: string;
}

export interface GroupInfo {
  key: GroupKey;
  color: string;
  name_en: string;
  name_id: string;
}

export const GROUPS = data.groups as GroupInfo[];
export const CATEGORY_LIST = data.categories as CategoryInfo[];
/** All category keys, in display order. */
export const CATEGORIES: readonly string[] = CATEGORY_LIST.map((c) => c.key);
/** For keys that are not a known category. */
export const OTHER_COLOR = data.other_color;

const BY_KEY = new Map(CATEGORY_LIST.map((c) => [c.key, c]));
const GROUP_BY_KEY = new Map(GROUPS.map((g) => [g.key, g]));

export const categoryInfo = (key: string): CategoryInfo | undefined => BY_KEY.get(key);
export const groupInfo = (key: string): GroupInfo | undefined => GROUP_BY_KEY.get(key as GroupKey);
export const colorFor = (key: string) => BY_KEY.get(key)?.color ?? OTHER_COLOR;
export const groupColor = (key: string) => GROUP_BY_KEY.get(key as GroupKey)?.color ?? OTHER_COLOR;
export const groupOf = (key: string): GroupKey | undefined => BY_KEY.get(key)?.group;
export const isTransfer = (key: string) => groupOf(key) === "transfers";
/** The keys in one group, in display order. */
export const inGroup = (group: GroupKey) => CATEGORY_LIST.filter((c) => c.group === group).map((c) => c.key);
export const inBucket = (bucket: BucketKey) => CATEGORY_LIST.filter((c) => c.bucket === bucket).map((c) => c.key);
