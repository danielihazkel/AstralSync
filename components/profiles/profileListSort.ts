/** Client-safe list shape: listProfiles() output with createdAt serialized. */
export interface ProfileListItem {
  id: number;
  displayName: string;
  birthDate: string;
  timeCertainty: string;
  sunSign: string | null;
  isSolarChart: boolean;
  latestVersion: number;
  /** The one chart marked "mine" — pinned to the top of every sort. */
  isPrimary: boolean;
  createdAt: string;
}

export type ProfileSortKey = "created" | "name" | "birth_date";

export const PROFILE_SORT_LABELS: Record<ProfileSortKey, string> = {
  created: "Date added",
  name: "Name A–Z",
  birth_date: "Birth date",
};

/** Case-insensitive substring match on the display name. */
export function filterProfiles(
  profiles: ProfileListItem[],
  query: string,
): ProfileListItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return profiles;
  return profiles.filter((p) => p.displayName.toLowerCase().includes(q));
}

/** Stable sort with id as the final tie-break; the primary profile always
 *  comes first. Never mutates the input. */
export function sortProfiles(
  profiles: ProfileListItem[],
  sort: ProfileSortKey,
): ProfileListItem[] {
  const compare = (a: ProfileListItem, b: ProfileListItem): number => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    switch (sort) {
      case "created":
        // Oldest first — the pre-sort default order of listProfiles().
        return a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
      case "name":
        return (
          a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: "base",
          }) || a.id - b.id
        );
      case "birth_date":
        return a.birthDate.localeCompare(b.birthDate) || a.id - b.id;
    }
  };
  return [...profiles].sort(compare);
}
