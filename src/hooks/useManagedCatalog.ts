import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { categoryService } from "@/services/category.service";
import { getCurrentOrgId } from "@/lib/supabase";
import { activeCatalog, catalogTree, EMPTY_CATALOG } from "@/lib/managed-catalog";

export function useManagedCatalog() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["categories", "all", getCurrentOrgId()], queryFn: () => categoryService.getAllGrouped(), staleTime: 60000 });
  const all = query.data ?? EMPTY_CATALOG;
  const catalog = useMemo(() => activeCatalog(all), [all]);
  const tree = useMemo(() => catalogTree(catalog), [catalog]);
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["categories"] }), client.invalidateQueries({ queryKey: ["products"] }), client.invalidateQueries({ queryKey: ["store-public"] }), client.invalidateQueries({ queryKey: ["catalog-assignments"] })]);
  };
  return { ...query, all, catalog, tree, refresh };
}
