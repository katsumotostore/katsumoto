import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { useAuth } from "@/lib/auth-context";
import { getCurrentOrgId } from "@/lib/supabase";
import { categoryService } from "@/services/category.service";
import { productService } from "@/services/product.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ImageUpload";
import { showError, showSuccess } from "@/utils/toast";
import { Plus, Pencil, Archive, ArrowRightLeft, FolderTree, Package, Briefcase, Folder, FolderOpen, Tag, Layers, Settings2, Image as ImageIcon, type LucideIcon } from "lucide-react";

const colorPresets = [
    {
      label: "Verde",
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      active: "bg-emerald-600 text-white",
    },
    {
      label: "Azul",
      color:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      active: "bg-blue-600 text-white",
    },
    {
      label: "Naranja",
      color:
        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      active: "bg-orange-600 text-white",
    },
    {
      label: "Morado",
      color:
        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      active: "bg-purple-600 text-white",
    },
    {
      label: "Rojo",
      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      active: "bg-red-600 text-white",
    },
    {
      label: "Cian",
      color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
      active: "bg-cyan-600 text-white",
    },
    {
      label: "Rosa",
      color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
      active: "bg-pink-600 text-white",
    },
    {
      label: "Ámbar",
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      active: "bg-amber-600 text-white",
    },
  ];
const catalogIcons: Record<string, LucideIcon> = { Package, Briefcase, Folder, FolderOpen, Tag, Layers, Settings2, FolderTree };
function CatalogIcon({name, className}: {name:string;className?:string}) { const Icon=catalogIcons[name] ?? Package; return <Icon className={className}/>; }

type Edit = { kind: "family" | "group" | "category"; id?: string; parent: string };
type Action = { kind: "archive" | "reassign" | "link"; id: string; name: string; node: "family" | "category" | "group"; family: string; count: number; active?: boolean };
const selectClass = "w-full rounded-lg border bg-background p-2 text-sm";
export function CategoryManager() {
  const { all, catalog, isLoading, error, refresh } = useManagedCatalog();
  const { user } = useAuth();
  const canManage = !!user && ["owner","admin","inventory"].includes(user.role);
  const { data: assignments = [], error: assignmentsError } = useQuery({ queryKey: ["catalog-assignments",getCurrentOrgId()], queryFn: () => categoryService.productAssignments(), enabled: canManage });
  const [selectedFamily,setSelectedFamily] = useState<string | null>(null);
  const [search,setSearch] = useState("");
  const [showArchived,setShowArchived] = useState(false);
  const [edit,setEdit] = useState<Edit | null>(null);
  const [name,setName] = useState("");
  const [color,setColor] = useState(colorPresets[0].color);
  const [icon,setIcon] = useState("Package");
  const [image,setImage] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [action,setAction] = useState<Action | null>(null);
  const [target,setTarget] = useState("");
  const count = (id: string) => assignments.filter(p => p.category_id === id).length;
  const pending = assignments.filter(p => !p.category_id || p.category === "Por clasificar");
  const openEdit = (value: Edit, label = "", url: string | null = null) => { const node = value.kind === "family" ? all.families.find(f=>f.id===value.id) : all.groups.find(g=>g.id===value.id); setColor(node?.color || colorPresets[value.kind === "group" ? 1 : 0].color); setIcon(node?.icon || (value.kind === "group" ? "Folder" : "Package")); setEdit(value); setName(label); setImage(url); };
  const openAction = (value: Action) => { setAction(value); setTarget(""); };
  const save = async () => {
    if (!edit || !name.trim() || busy) return;
    if (edit.kind === "family" && ["producto","productos","servicio","servicios"].includes(name.trim().toLowerCase())) { showError("Producto y Servicio son tipos. Usa una familia como Carburador."); return; }
    setBusy(true);
    try {
      if (edit.kind === "family") {
        const activeColor = colorPresets.find(p=>p.color===color)?.active ?? "bg-orange-600 text-white";
        if(edit.id) await categoryService.updateFamily(edit.id,{label:name.trim(),color,icon,activeColor});
        else await categoryService.createFamily({key:`f_${crypto.randomUUID().replaceAll("-","")}`,label:name.trim(),color,icon,activeColor});
      } else if (edit.kind === "group") {
        if (edit.id) await categoryService.updateGroup(edit.id,{label:name.trim(),color,icon});
        else await categoryService.createGroup({familyId:edit.parent,key:`g_${crypto.randomUUID().replaceAll("-","")}`,label:name.trim(),color,icon});
      } else {
        if (edit.id) await categoryService.updateCategory(edit.id,{name:name.trim(),imageUrl:image});
        else await categoryService.createCategory({groupId:edit.parent,name:name.trim(),imageUrl:image ?? undefined});
      }
      await refresh();setEdit(null);showSuccess("Catálogo actualizado");
    } catch(e) { showError((e as Error).message); } finally {setBusy(false);}
  };
  const apply = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      if (action.kind === "archive") await categoryService.setActive(action.node,action.id,!action.active);
      else if (action.kind === "reassign") { if (!target) return; await categoryService.reassign(action.id,target); }
      else { if (!target) return; await productService.update(action.id,{category_id:target}); }
      await refresh();setAction(null);showSuccess("Cambio aplicado");
    } catch(e) {showError((e as Error).message);} finally {setBusy(false);}
  };
  if (isLoading) return <p role="status">Cargando catálogo administrado…</p>;
  if (error) return <div role="alert">No se pudo cargar el catálogo. <Button variant="outline" onClick={() => void refresh()}>Reintentar</Button></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-2xl font-bold flex items-center gap-2"><FolderTree className="h-6 w-6 text-orange-600 dark:text-orange-400"/>Gestión de Categorías</h2><p className="text-sm text-muted-foreground mt-1">Familia → Grupo → Categoría. Una sola clasificación para inventario, POS, tienda e importaciones.</p></div>
      {canManage && <Button className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white" onClick={() => openEdit({kind:"family",parent:"root"})}><Plus className="mr-2 h-4 w-4"/>Crear familia</Button>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[
      {label:"Familias",value:catalog.families.length,icon:Layers,color:"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"},
      {label:"Grupos",value:catalog.groups.length,icon:Folder,color:"border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"},
      {label:"Categorías",value:catalog.categories.length,icon:Tag,color:"border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300"},
      {label:"Con imagen",value:catalog.categories.filter(c=>c.imageUrl).length,icon:ImageIcon,color:"border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"}
    ].map(stat=><div key={stat.label} className={`rounded-2xl border shadow-sm p-4 flex items-center gap-3 ${stat.color}`}><stat.icon className="h-6 w-6"/><div><p className="text-xs font-medium">{stat.label}</p><p className="text-2xl font-bold">{stat.value}</p></div></div>)}</div>
    <div className="rounded-xl bg-muted/40 p-4 text-sm">El tipo Producto o Servicio se elige en cada artículo, independientemente de su familia. Ejemplo: Carburador → Original → STIHL, o Carburador → Alternativo → STIHL2.</div>
    {assignmentsError && <p role="alert" className="text-destructive">No se pudo consultar el uso de categorías. Recarga antes de gestionar asignaciones.</p>}
    {pending.length>0 && <details className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-4 space-y-3"><summary className="font-semibold cursor-pointer">{pending.length} artículos pendientes de clasificación</summary>{pending.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{p.sku} · {p.name} · {p.product_family} / {p.category_group} / {p.category}</span><Button size="sm" variant="outline" onClick={()=>openAction({kind:"link",id:p.id,name:p.name,node:"category",family:p.product_family,count:1})}>Asignar categoría</Button></div>)}</details>}
    <div className="flex flex-wrap gap-4 items-center"><Input className="max-w-md" aria-label="Buscar grupo o categoría" placeholder="Buscar grupo o categoría…" value={search} onChange={e=>setSearch(e.target.value)}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Mostrar archivados</label></div>
    <div className="flex flex-wrap gap-3">{all.families.filter(f=>showArchived||f.isActive!==false).map(f=><button key={f.id} onClick={()=>setSelectedFamily(selectedFamily===f.id?null:f.id)} aria-pressed={selectedFamily===f.id} className={`rounded-2xl border px-5 py-3 text-left shadow-sm transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-orange-500 ${selectedFamily===f.id?"border-orange-500 ring-1 ring-orange-500":"border-transparent"} ${f.color || colorPresets[0].color}`}><CatalogIcon name={f.icon} className="h-6 w-6 mb-2"/><span className="font-semibold">{f.label}</span><span className="block text-xs text-muted-foreground">{all.groups.filter(g=>g.familyId===f.id).length} grupos{f.isActive===false?" · Archivada":""}</span></button>)}</div>
    {all.families.filter(f=>(showArchived||f.isActive!==false)&&(!selectedFamily||f.id===selectedFamily)).map(f=><section key={f.id} className="space-y-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-lg flex items-center gap-3"><span className={`p-2 rounded-xl ${f.color || colorPresets[0].color}`}><CatalogIcon name={f.icon} className="h-5 w-5"/></span>{f.label}</h3>{canManage&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={f.isActive===false} onClick={()=>openEdit({kind:"group",parent:f.id})}><Plus className="h-4 w-4 mr-1"/>Grupo</Button><Button size="sm" variant="ghost" onClick={()=>openEdit({kind:"family",id:f.id,parent:"root"},f.label)}>Editar familia</Button><Button size="sm" variant="ghost" onClick={()=>openAction({kind:"archive",node:"family",id:f.id,name:f.label,family:f.key,count:assignments.filter(p=>all.groups.some(g=>g.familyId===f.id&&g.key===p.category_group)).length,active:f.isActive!==false})}>{f.isActive===false?"Restaurar":"Archivar"}</Button></div>}</div>
      {all.groups.filter(g=>g.familyId===f.id&&(showArchived||g.isActive!==false)).filter(g=>!search||g.label.toLowerCase().includes(search.toLowerCase())||all.categories.some(c=>c.groupId===g.id&&c.name.toLowerCase().includes(search.toLowerCase()))).map(g=><div key={g.id} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className={`p-4 flex flex-wrap justify-between items-center gap-3 ${g.color || colorPresets[1].color}`}><div><h4 className="font-semibold flex items-center gap-2"><CatalogIcon name={g.icon} className="h-5 w-5"/>{g.label} {g.isActive===false&&<span className="text-xs font-normal">· Archivado</span>}</h4><p className="text-xs text-muted-foreground">{all.categories.filter(c=>c.groupId===g.id).length} categorías</p></div>
          {canManage&&<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={g.isActive===false} onClick={()=>openEdit({kind:"category",parent:g.id})}><Plus className="h-4 w-4 mr-1"/>Categoría</Button><Button size="sm" variant="ghost" aria-label={`Renombrar grupo ${g.label}`} onClick={()=>openEdit({kind:"group",id:g.id,parent:f.id},g.label)}><Pencil className="h-4 w-4"/></Button><Button size="sm" variant="ghost" onClick={()=>openAction({kind:"archive",node:"group",id:g.id,name:g.label,family:f.key,count:assignments.filter(p=>all.categories.some(c=>c.groupId===g.id&&c.id===p.category_id)).length,active:g.isActive!==false})}>{g.isActive===false?"Restaurar":"Archivar grupo"}</Button></div>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">{all.categories.filter(c=>c.groupId===g.id&&(showArchived||c.isActive!==false)&&(!search||g.label.toLowerCase().includes(search.toLowerCase())||c.name.toLowerCase().includes(search.toLowerCase()))).map(c=><div key={c.id} className="rounded-2xl border bg-card p-3 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md hover:border-orange-300 transition-all"><div>{c.imageUrl?<img src={c.imageUrl} alt={c.name} className="h-48 sm:h-52 w-full object-contain rounded-xl bg-white p-3 mb-3"/>:<div className="h-48 sm:h-52 rounded-xl bg-orange-50 dark:bg-orange-950/20 flex flex-col gap-2 items-center justify-center mb-3"><ImageIcon className="h-10 w-10 text-orange-300"/><span className="text-xs text-muted-foreground">Sin imagen</span></div>}<p className="font-medium">{c.name} {c.isActive===false&&<span className="text-xs text-muted-foreground">· Archivada</span>}</p><p className="text-sm text-muted-foreground">{count(c.id)} artículos vinculados, incluidos inactivos</p></div>{canManage&&<div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={c.isActive===false||g.isActive===false} aria-label={`Editar categoría ${c.name}`} onClick={()=>openEdit({kind:"category",id:c.id,parent:g.id},c.name,c.imageUrl)}><Pencil className="h-4 w-4"/></Button>
          <Button size="sm" variant="outline" disabled={!!assignmentsError} onClick={()=>openAction({kind:"reassign",node:"category",id:c.id,name:c.name,family:f.key,count:count(c.id)})}><ArrowRightLeft className="h-4 w-4 mr-1"/>Reasignar</Button>
          <Button size="sm" variant="ghost" disabled={g.isActive===false} onClick={()=>openAction({kind:"archive",node:"category",id:c.id,name:c.name,family:f.key,count:count(c.id),active:c.isActive!==false})}><Archive className="h-4 w-4 mr-1"/>{c.isActive===false?"Restaurar":"Archivar"}</Button>
        </div>}</div>)}</div>
        {!all.categories.some(c=>c.groupId===g.id)&&<p className="p-4 text-sm text-muted-foreground">Crea la primera categoría de este grupo.</p>}
      </div>)}
    </section>)}
    <Dialog open={!!edit} onOpenChange={open=>{if(!open&&!busy)setEdit(null);}}><DialogContent><DialogHeader><DialogTitle>{edit?.id?"Editar":"Crear"} {edit?.kind==="family"?"familia":edit?.kind==="group"?"grupo":"categoría"}</DialogTitle><DialogDescription>Los artículos conservan su vínculo cuando cambias el nombre.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}>
        {edit?.kind==="group"&&!edit.id&&<><Label htmlFor="catalog-type">Familia</Label><select id="catalog-type" className={selectClass} value={edit.parent} onChange={e=>setEdit({...edit,parent:e.target.value})}>{catalog.families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></>}
        <Label htmlFor="catalog-name">Nombre</Label><Input id="catalog-name" autoFocus value={name} maxLength={100} onChange={e=>setName(e.target.value)}/>
        {edit?.kind==="category"?<ImageUpload value={image} onChange={setImage}/>:<div className="space-y-3"><Label>Color</Label><div className="flex flex-wrap gap-2">{colorPresets.map(p=><button key={p.label} type="button" aria-pressed={color===p.color} onClick={()=>setColor(p.color)} className={`px-3 py-2 rounded-xl border text-sm ${p.color} ${color===p.color?"ring-2 ring-orange-500 ring-offset-2":"border-transparent"}`}>{p.label}</button>)}</div><Label>Icono</Label><div className="flex flex-wrap gap-2">{Object.keys(catalogIcons).map(key=><button key={key} type="button" aria-label={key} aria-pressed={icon===key} onClick={()=>setIcon(key)} className={`p-3 rounded-xl border ${icon===key?color:"bg-muted/30"}`}><CatalogIcon name={key} className="h-5 w-5"/></button>)}</div></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setEdit(null)}>Cancelar</Button><Button type="submit" disabled={busy||!name.trim()||!edit?.parent}>{busy?"Guardando…":"Guardar"}</Button></div>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open=>{if(!open&&!busy)setAction(null);}}><DialogContent><DialogHeader><DialogTitle>{action?.kind==="archive"?(action.active?"Archivar":"Restaurar"):"Reasignar clasificación"}</DialogTitle><DialogDescription>{action?.name} · {action?.count} artículos vinculados.</DialogDescription></DialogHeader>
      {action?.kind==="archive"?<p className="text-sm">{action.active?"Los artículos conservan su clasificación. Esta opción dejará de ofrecerse en nuevas asignaciones; si es un grupo, también sus categorías.":"Volverá a estar disponible para nuevas asignaciones."}</p>:<div className="space-y-3"><p className="text-sm">{action?.kind==="reassign"?"Se trasladarán todos los artículos, incluidos inactivos, al destino y se archivará la categoría de origen. No cambia precios, stock ni comprobantes históricos.":"Selecciona el destino de este artículo."}</p><Label htmlFor="catalog-target">Categoría destino</Label><select id="catalog-target" className={selectClass} value={target} onChange={e=>setTarget(e.target.value)}><option value="">Selecciona un destino</option>{catalog.categories.filter(c=>c.id!==action?.id).map(c=><option key={c.id} value={c.id}>{catalog.families.find(f=>f.id===catalog.groups.find(g=>g.id===c.groupId)?.familyId)?.label} / {catalog.groups.find(g=>g.id===c.groupId)?.label} / {c.name}</option>)}</select></div>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={()=>setAction(null)}>Cancelar</Button><Button disabled={busy||(action?.kind!=="archive"&&!target)} onClick={()=>void apply()}>{busy?"Aplicando…":"Confirmar cambio"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}
