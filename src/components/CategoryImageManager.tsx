import { useState } from "react";
import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { categoryService } from "@/services/category.service";
import { ImageUpload } from "@/components/ImageUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { showError } from "@/utils/toast";

export function CategoryImageManager({open,onClose}:{open:boolean;onClose:()=>void}) {
  const { catalog, refresh, error, isLoading } = useManagedCatalog();
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState<string|null>(null);
  const save=async(id:string,url:string|null)=>{
    setSaving(id);
    try {await categoryService.updateCategory(id,{imageUrl:url});await refresh();}
    catch(e){showError((e as Error).message);}finally{setSaving(null);}
  };
  return <Dialog open={open} onOpenChange={onClose}><DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Imágenes del catálogo</DialogTitle><DialogDescription>Las imágenes se guardan en las categorías administradas y permanecen al recargar.</DialogDescription></DialogHeader>
    <Input aria-label="Buscar categoría" placeholder="Buscar categoría…" value={search} onChange={e=>setSearch(e.target.value)}/>
    {isLoading&&<p>Cargando…</p>}{error&&<p role="alert">No se pudo cargar el catálogo.</p>}
    {catalog.categories.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())).map(c=><div key={c.id} className="flex items-center justify-between gap-4 border-b py-3"><div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{catalog.groups.find(g=>g.id===c.groupId)?.label}</p>{saving===c.id&&<p role="status">Guardando…</p>}</div><div className={saving?"pointer-events-none opacity-60":""}><ImageUpload compact value={c.imageUrl} onChange={url=>void save(c.id,url)}/></div></div>)}
  </DialogContent></Dialog>;
}
