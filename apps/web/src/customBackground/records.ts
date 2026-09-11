import {
  type CustomBackgroundFilter,
  type CustomBackgroundFilterKind,
  type CustomBackgroundRecord,
  DEFAULT_CUSTOM_BACKGROUND_FADE,
  defaultCustomBackgroundFilter,
  isGenerativeCustomBackgroundFilter,
} from "@t3tools/contracts";

export type CustomBackgroundLibrary = ReadonlyArray<CustomBackgroundRecord>;
export type CustomBackgroundRouteKind = "draft" | "conversation" | "other";

export function nextNewBackgroundName(library: CustomBackgroundLibrary): string {
  const taken = new Set(library.map((record) => record.name.toLowerCase()));
  for (let index = 1; ; index += 1) {
    const candidate = `New Background ${index}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function createGenerativeBackground(input: {
  id: string;
  name: string;
  filter: CustomBackgroundFilter;
  createdAt: string;
}): CustomBackgroundRecord {
  return {
    id: input.id,
    name: input.name,
    source: { kind: "none" },
    filter: input.filter,
    fade: DEFAULT_CUSTOM_BACKGROUND_FADE,
    createdAt: input.createdAt,
  };
}

export function upsertBackground(
  library: CustomBackgroundLibrary,
  record: CustomBackgroundRecord,
): CustomBackgroundLibrary {
  const index = library.findIndex((candidate) => candidate.id === record.id);
  if (index === -1) return [...library, record];
  return library.map((candidate, position) => (position === index ? record : candidate));
}

export function removeBackground(
  library: CustomBackgroundLibrary,
  id: string,
): CustomBackgroundLibrary {
  return library.filter((record) => record.id !== id);
}

// Keep the image reference so switching back from a generative filter restores it.
export function withFilterKind(
  record: CustomBackgroundRecord,
  kind: CustomBackgroundFilterKind,
): CustomBackgroundRecord {
  if (record.filter.kind === kind) return record;
  return { ...record, filter: defaultCustomBackgroundFilter(kind) };
}

export function nextActiveAfterRemove(activeId: string | null, removedId: string): string | null {
  return activeId === removedId ? null : activeId;
}

export function backgroundIsRenderable(record: CustomBackgroundRecord): boolean {
  return isGenerativeCustomBackgroundFilter(record.filter.kind) || record.source.kind === "image";
}

export function filtersEqual(a: CustomBackgroundFilter, b: CustomBackgroundFilter): boolean {
  if (a.kind !== b.kind) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left: unknown = Reflect.get(a, key);
    const right: unknown = Reflect.get(b, key);
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false;
      if (left.some((value, index) => value !== right[index])) return false;
      continue;
    }
    if (left !== right) return false;
  }
  return true;
}

export function resolveDisplayedBackground({
  selected,
  preview,
  enabled,
  editing,
  routeKind,
  inConversations,
}: {
  selected: CustomBackgroundRecord | null;
  preview: CustomBackgroundRecord | null;
  enabled: boolean;
  editing: boolean;
  routeKind: CustomBackgroundRouteKind;
  inConversations: boolean;
}): CustomBackgroundRecord | null {
  if (!enabled || routeKind === "other" || (routeKind === "conversation" && !inConversations)) {
    return null;
  }
  return editing && preview?.id === selected?.id ? preview : selected;
}
