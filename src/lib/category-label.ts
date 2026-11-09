import type { Category } from "./types";
export function categoryLabel(category: Category, all: Category[]) {
  const map = new Map(all.map((c) => [c.id, c]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current: Category | undefined = category;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return names.join(" — ");
}
export const categoryMaxDepth = 8;
export function canReparentCategory(
  all: Category[],
  id: string | undefined,
  parentId: string | null,
) {
  const map = new Map(all.map((c) => [c.id, c]));
  let depth = 0,
    current = parentId ? map.get(parentId) : undefined;
  const ancestors = new Set<string>();
  if (parentId && !current) return false;
  while (current) {
    if (current.id === id || ancestors.has(current.id)) return false;
    ancestors.add(current.id);
    depth++;
    if (depth >= categoryMaxDepth) return false;
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  let height = 1,
    frontier = id ? [id] : [],
    seen = new Set<string>();
  while (frontier.length) {
    const next: string[] = [];
    for (const node of frontier) {
      if (seen.has(node)) return false;
      seen.add(node);
      for (const child of all.filter((c) => c.parentId === node))
        next.push(child.id);
    }
    if (next.length) height++;
    if (height > categoryMaxDepth) return false;
    frontier = next;
  }
  return depth + height <= categoryMaxDepth;
}
export function categoryParentOptions(all: Category[], id?: string) {
  return sortCategoryTree(all).filter((c) =>
    canReparentCategory(all, id, c.id),
  );
}
export function sortCategoryTree(all: Category[]): Category[] {
  const compare = (a: Category, b: Category) =>
    /^\d+$/.test(a.id) && /^\d+$/.test(b.id)
      ? Number(a.id) - Number(b.id)
      : a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id);
  const sorted: Category[] = [];
  const seen = new Set<string>();
  function visit(c: Category) {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    sorted.push(c);
    all
      .filter((n) => n.parentId === c.id)
      .sort(compare)
      .forEach(visit);
  }
  all
    .filter((c) => !c.parentId)
    .sort(compare)
    .forEach(visit);
  all
    .filter((c) => !seen.has(c.id))
    .sort(compare)
    .forEach(visit);
  return sorted;
}
/** الأقسام الظاهرة للعامة: ما فيه منتج منشور واختارته أسرة معتمدة، مع آبائه ليبقى التسلسل مفهومًا. */
export function visibleCategoryTree(all: Category[], used: Iterable<string>) {
  const map = new Map(all.map((c) => [c.id, c]));
  const keep = new Set<string>();
  for (const id of used) {
    let current = map.get(id);
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
  }
  return all.filter((c) => keep.has(c.id));
}
