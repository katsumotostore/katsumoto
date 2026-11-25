import type { ManagedCategory, ManagedCategoryFamily, ManagedCategoryGroup } from "./types";

export interface ManagedCatalog {
  families: ManagedCategoryFamily[];
  groups: ManagedCategoryGroup[];
  categories: ManagedCategory[];
}
export const EMPTY_CATALOG: ManagedCatalog = { families: [], groups: [], categories: [] };

export function activeCatalog(data: ManagedCatalog): ManagedCatalog {
  const families = data.families.filter(f => f.isActive !== false);
  const groups = data.groups.filter(g => g.isActive !== false && families.some(f => f.id === g.familyId));
  const categories = data.categories.filter(c => c.isActive !== false && groups.some(g => g.id === c.groupId));
  return { families, groups, categories };
}

export function catalogCategories(data: ManagedCatalog, family: string, group: string) {
  const groupIds = new Set(data.groups.filter(g => (group === "all" || g.key === group) &&
    (family === "all" || data.families.some(f => f.id === g.familyId && f.key === family))).map(g => g.id));
  return data.categories.filter(c => groupIds.has(c.groupId)).sort((a,b) => a.order-b.order || a.name.localeCompare(b.name));
}

export function catalogTree(data: ManagedCatalog) {
  return Object.fromEntries(data.families.map(f => [f.key, { ...f, groups: Object.fromEntries(data.groups.filter(g => g.familyId === f.id).map(g => [g.key, { ...g, categories: data.categories.filter(c => c.groupId === g.id).map(c => c.name) }])) }]));
}

export function getGroupInfo(key: string, groups?: ManagedCategoryGroup[]) {
  const group = groups?.find(g => g.key === key);
  return { label: group?.label ?? key, color: group?.color ?? "bg-muted text-muted-foreground" };
}

export function productCatalogFamily(data: ManagedCatalog, product: { category_id?: string | null; category_group: string }) {
 const category = data.categories.find(c => c.id === product.category_id);
 const group = data.groups.find(g => category ? g.id === category.groupId : g.key === product.category_group);
 return data.families.find(f => f.id === group?.familyId)?.key;
}
