import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { catalogCategories, type ManagedCatalog } from "@/lib/managed-catalog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type ManagedFilterData = ManagedCatalog;
interface Props {
  familyFilter: string; groupFilter: string; categoryFilter: string;
  onChange: (family: string, group: string, category: string) => void;
  compact?: boolean; showClear?: boolean; managedData?: ManagedFilterData;
}
export function CategoryTreeFilter({ familyFilter, groupFilter, categoryFilter, onChange, compact, showClear, managedData }: Props) {
  const { catalog, isLoading, error } = useManagedCatalog();
  const data = managedData ?? catalog;
  const groups = data.groups.filter(g => familyFilter === "all" || data.families.some(f => f.id === g.familyId && f.key === familyFilter));
  const categories = catalogCategories(data, familyFilter, groupFilter);
  const className = compact ? "w-full sm:w-40 h-8" : "w-full sm:w-52 rounded-xl";
  if (error) return <p role="alert" className="text-sm text-destructive">No se pudo cargar el catálogo administrado. Recarga para reintentar.</p>;
  return <>
    <Select value={familyFilter} onValueChange={v => onChange(v,"all","all")} disabled={isLoading}>
      <SelectTrigger className={className} aria-label="Tipo de artículo"><SelectValue placeholder="Tipo" /></SelectTrigger>
      <SelectContent><SelectItem value="all">Productos y servicios</SelectItem>{data.families.map(f => <SelectItem key={f.id} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
    </Select>
    <Select value={groupFilter} onValueChange={v => onChange(familyFilter,v,"all")} disabled={isLoading}>
      <SelectTrigger className={className} aria-label="Grupo"><SelectValue placeholder="Grupo" /></SelectTrigger>
      <SelectContent><SelectItem value="all">Todos los grupos</SelectItem>{groups.map(g => <SelectItem key={g.id} value={g.key}>{g.label}</SelectItem>)}</SelectContent>
    </Select>
    <Select value={categoryFilter} onValueChange={v => onChange(familyFilter,groupFilter,v)} disabled={isLoading}>
      <SelectTrigger className={className} aria-label="Categoría"><SelectValue placeholder="Categoría" /></SelectTrigger>
      <SelectContent><SelectItem value="all">Todas las categorías</SelectItem><SelectItem value="unlinked">Pendientes de vincular</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name} · {data.groups.find(g => g.id === c.groupId)?.label}</SelectItem>)}</SelectContent>
    </Select>
    {showClear && [familyFilter,groupFilter,categoryFilter].some(v => v!=="all") && <Button variant="ghost" onClick={() => onChange("all","all","all")}>Limpiar</Button>}
  </>;
}
