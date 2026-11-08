import type { Category } from "./types";
export function categoryLabel(category: Category, all: Category[]) {
  const parent = all.find((item) => item.id === category.parentId);
  return parent ? `${parent.name} — ${category.name}` : category.name;
}
