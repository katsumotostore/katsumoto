import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import type { Product, PriceTier, Cents } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { getLowestTierInfo } from "@/lib/pricing";
import { TAX_AFFECTATION_TYPES } from "@/lib/constants";
import { ProductImage } from "@/components/ProductImage";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, X, ChevronLeft, ChevronRight, Package, FilterX, Tag, FolderTree } from "lucide-react";

interface PosProductGridProps {
  products: Product[];
  priceTiers: PriceTier[];
  onAdd: (product: Product) => void;
  disabled?: boolean;
}

type StockFilter = "all" | "available" | "low" | "out";

const PAGE_SIZE = 24;

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "available", label: "Disponible" },
  { value: "low", label: "Stock bajo" },
  { value: "out", label: "Agotado" },
];

export function PosProductGrid({ products, priceTiers, onAdd, disabled }: PosProductGridProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [page, setPage] = useState(1);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const { data: managedFamilies = [] } = useQuery({
    queryKey: ["managed-families"],
    queryFn: async () => {
      const { data } = await supabase.from("managed_category_families").select("id,key,label").order("label");
      return (data || []) as { id: string; key: string; label: string }[];
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: managedGroups = [] } = useQuery({
    queryKey: ["managed-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("managed_category_groups").select("key,label,family_id").order("label");
      return (data || []) as { key: string; label: string; family_id: string }[];
    },
    staleTime: 30 * 60 * 1000,
  });

  const families = useMemo(() => {
    return managedFamilies.map((fam) => {
      const count = products.filter((p) => p.category === fam.label || p.category === fam.key).length;
      return { ...fam, count };
    }).filter((fam) => fam.count > 0);
  }, [managedFamilies, products]);

  const groups = useMemo(() => {
    const familyId = familyFilter !== "all"
      ? managedFamilies.find(f => f.key === familyFilter || f.label === familyFilter)
      : null;

    return managedGroups
      .filter((g) => !familyId || g.family_id === familyId.key || g.family_id === familyId.id)
      .map((g) => {
        const count = products.filter((p) => p.category_group === g.label || p.category_group === g.key).length;
        return { ...g, count };
      });
  }, [managedGroups, familyFilter, managedFamilies, products]);

  const tierInfoMap = useMemo(() => {
    const map = new Map<string, { priceCents: Cents; minQuantity: number; label: string } | null>();
    for (const p of products) {
      map.set(p.id, getLowestTierInfo(priceTiers, p.id));
    }
    return map;
  }, [products, priceTiers]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !debouncedSearch || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q);

      let matchFamily = true;
      if (familyFilter !== "all") {
        const fam = managedFamilies.find(f => f.key === familyFilter);
        if (fam) {
          matchFamily = p.category === fam.label || p.category === fam.key;
        } else {
          matchFamily = p.category === familyFilter;
        }
      }

      let matchGroup = true;
      if (groupFilter !== "all") {
        const grp = managedGroups.find(g => g.key === groupFilter);
        if (grp) {
          matchGroup = p.category_group === grp.label || p.category_group === grp.key;
        } else {
          matchGroup = p.category_group === groupFilter;
        }
      }

      let matchStock = true;
      if (stockFilter === "available") matchStock = p.stock > p.min_stock;
      else if (stockFilter === "low") matchStock = p.stock > 0 && p.stock <= p.min_stock;
      else if (stockFilter === "out") matchStock = p.stock === 0;

      return matchSearch && matchFamily && matchGroup && matchStock;
    });
  }, [products, debouncedSearch, familyFilter, groupFilter, stockFilter, managedFamilies, managedGroups]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleAdd = (product: Product) => {
    if (disabled || product.stock === 0) return;
    onAdd(product);
    setJustAdded(product.id);
    setTimeout(() => setJustAdded(null), 400);
  };

  const hasActiveFilters = familyFilter !== "all" || groupFilter !== "all" || stockFilter !== "all" || search !== "";

  const clearFilters = () => {
    setSearch("");
    setFamilyFilter("all");
    setGroupFilter("all");
    setStockFilter("all");
    setPage(1);
  };

  const maxVisibleFamilies = 8;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2.5 py-2 border-b bg-card/50 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar o escanear..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 rounded-lg text-sm border bg-background"
            disabled={disabled}
            autoFocus
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-full">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {families.length <= maxVisibleFamilies ? (
          <div className="flex bg-muted/50 rounded-lg p-0.5 flex-shrink-0">
            <button
              onClick={() => { setFamilyFilter("all"); setGroupFilter("all"); setPage(1); }}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                familyFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todo
            </button>
            {families.map((fam) => (
              <button
                key={fam.key}
                onClick={() => { setFamilyFilter(fam.key); setGroupFilter("all"); setPage(1); }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                  familyFilter === fam.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {fam.label} ({fam.count})
              </button>
            ))}
          </div>
        ) : (
          <Select value={familyFilter} onValueChange={(v) => { setFamilyFilter(v); setGroupFilter("all"); setPage(1); }}>
            <SelectTrigger className="h-9 rounded-lg text-xs font-medium w-auto min-w-[140px] border bg-background">
              <SelectValue>
                {familyFilter === "all" ? "Familia" : `${managedFamilies.find(f => f.key === familyFilter)?.label || familyFilter} (${families.find(f => f.key === familyFilter)?.count || 0})`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-xs">Todas las familias</SelectItem>
              {families.map((fam) => (
                <SelectItem key={fam.key} value={fam.key} className="text-xs">
                  {fam.label} ({fam.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {groups.length > 0 && (
          <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 rounded-lg text-xs font-medium w-auto min-w-[130px] border bg-background">
              <SelectValue>
                <span className="flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
                  {groupFilter === "all" ? "Grupo" : groupFilter}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos los grupos</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.key} value={g.key} className="text-xs">
                  {g.label} ({g.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={stockFilter} onValueChange={(v) => { setStockFilter(v as StockFilter); setPage(1); }}>
          <SelectTrigger className="h-9 rounded-lg text-xs font-medium w-auto border bg-background">
            <SelectValue>{STOCK_OPTIONS.find(o => o.value === stockFilter)?.label || "Stock"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STOCK_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="p-1.5 hover:bg-muted rounded-lg transition-colors flex-shrink-0" title="Limpiar filtros">
            <FilterX className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-auto">
          {filtered.length} prod.
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-25">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-center">{safePage}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-25">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {paginated.map((product) => {
            const isOut = product.stock === 0;
            const isLow = product.stock > 0 && product.stock <= product.min_stock;
            const wasJustAdded = justAdded === product.id;
            const taxType = product.tax_affectation || "gravado";
            const taxInfo = TAX_AFFECTATION_TYPES[taxType];
            const tierInfo = tierInfoMap.get(product.id);

            return (
              <button
                key={product.id}
                onClick={() => handleAdd(product)}
                disabled={isOut || disabled}
                className={`text-left rounded-xl transition-all duration-150 overflow-hidden flex flex-col ${
                  isOut || disabled
                    ? "opacity-35 cursor-not-allowed bg-card border border-border/40"
                    : wasJustAdded
                    ? "ring-2 ring-emerald-500 scale-[0.97] bg-card border border-emerald-300 dark:border-emerald-700"
                    : "bg-card border border-border/40 hover:border-orange-400/60 dark:hover:border-orange-600/60 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
                }`}
              >
                <div className="relative aspect-[4/3] bg-muted/20">
                  <ProductImage src={product.image_url} name={product.name} className="w-full h-full" />
                  <div className="absolute top-1.5 left-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${taxInfo?.solidColor || "bg-slate-500 text-white"}`}>
                      {taxInfo?.label || "Gravado"} {taxInfo?.rate || "18%"}
                    </span>
                  </div>
                  <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isOut ? "bg-red-500/90 text-white"
                    : isLow ? "bg-amber-500/90 text-white"
                    : "bg-emerald-500/90 text-white"
                  }`}>
                    {isOut ? "AGOT" : product.stock}
                  </div>
                  {tierInfo && !isOut && (
                    <div className="absolute bottom-1 left-1 right-1">
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/90 text-white">
                        <Tag className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="text-[9px] font-bold truncate leading-none">
                          {formatCents(tierInfo.priceCents)} ×{tierInfo.minQuantity}+
                        </span>
                      </div>
                    </div>
                  )}
                  {isOut && (
                    <div className="absolute inset-0 bg-background/40 flex items-center justify-center">
                      <span className="text-xs font-bold text-muted-foreground bg-background/80 px-2 py-1 rounded-full">Agotado</span>
                    </div>
                  )}
                  {wasJustAdded && (
                    <div className="absolute inset-0 bg-emerald-500/15 animate-pulse" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{product.name}</p>
                  <div className="flex items-center justify-between mt-1.5 gap-1">
                    <p className="text-base font-bold text-orange-600 dark:text-orange-400 leading-tight">{formatCents(product.price_cents)}</p>
                    <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${taxInfo?.solidColor || "bg-slate-500 text-white"}`}>{taxInfo?.code || "10"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <div className="text-center">
              <Package className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Sin resultados</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-orange-600 dark:text-orange-400 hover:underline mt-2 inline-flex items-center gap-1">
                  <FilterX className="w-3.5 h-3.5" />Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
