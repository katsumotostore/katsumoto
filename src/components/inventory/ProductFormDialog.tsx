import { useEffect, useState } from "react";
import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { categoryService } from "@/services/category.service";
import { showError } from "@/utils/toast";
import { useAuth } from "@/lib/auth-context";
import { UseFormReturn } from "react-hook-form";
import {
  UNITS,
  MACHINE_CATEGORIES,
  TAX_AFFECTATION_TYPES,
} from "@/lib/constants";
import { ImageUpload } from "@/components/ImageUpload";
import { PriceTiersEditor } from "@/components/inventory/PriceTiersEditor";
import { storageService } from "@/services/storage.service";
import type {
  Product,
  TaxAffectation,
  ProductFamily,
  CategoryGroup,
  MachineModel,
  PriceTier,
  ProductMachineModel,
} from "@/lib/types";
import type { ProductFormValues } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, Briefcase, ImageIcon, Cog, Tag, X, Loader2 } from "lucide-react";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  form: UseFormReturn<ProductFormValues>;
  machineModels: MachineModel[];
  productMachines: ProductMachineModel[];
  priceTiers: PriceTier[];
  onSave: (data: ProductFormValues) => void;
  isSaving?: boolean;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  editingProduct,
  form,
  machineModels,
  productMachines: _productMachines,
  priceTiers: _priceTiers,
  onSave,
  isSaving = false,
}: ProductFormDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const formFamily = watch("product_family");
  const formCategoryGroup = watch("category_group");
  const formImageUrl = watch("image_url");
  const formSelectedMachineIds = watch("selectedMachineIds");
  const formPriceTiers = watch("priceTiers");
  const formPriceSoles = watch("price_soles");
  const formCostSoles = watch("cost_soles");
  const formTaxAffectation = watch("tax_affectation");
  const formUnit = watch("unit");
  const formCategory = watch("category");
  const formTags = watch("tags") || [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !formTags.includes(trimmed)) {
      setValue("tags", [...formTags, trimmed]);
    }
  };

  const removeTag = (tag: string) => {
    setValue("tags", formTags.filter((t: string) => t !== tag));
  };

  const toggleMachine = (machineId: string) => {
    const current = watch("selectedMachineIds") || [];
    const updated = current.includes(machineId)
      ? current.filter((id) => id !== machineId)
      : [...current, machineId];
    setValue("selectedMachineIds", updated);
  };

  const { catalog, isLoading: catalogLoading, error: catalogError, refresh } = useManagedCatalog();
  const { user } = useAuth();
  const canManage = !!user && ["owner","admin","inventory"].includes(user.role);
  const [categorySearch, setCategorySearch] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [chosenFamily, setChosenFamily] = useState<string | null>(null);
  useEffect(() => { setChosenFamily(null); setCategorySearch(""); }, [open, editingProduct?.id]);
  const family = catalog.families.find(f => f.id === (chosenFamily ?? catalog.groups.find(g => g.key === formCategoryGroup)?.familyId));
  const formGroups = catalog.groups.filter(g => g.familyId === family?.id);
  const group = formGroups.find(g => g.key === formCategoryGroup);
  const formCategories = catalog.categories.filter(c => c.groupId === group?.id);
  const categoryId = watch("category_id");
  const validCategory = formCategories.find(c => c.id === categoryId);
  const chooseCategory = (id: string) => {
    const category = formCategories.find(c => c.id === id);
    setValue("category_id", id, { shouldDirty: true });
    setValue("category", category?.name ?? "", { shouldDirty: true, shouldValidate: true });
  };
  const createCategory = async () => {
    if (!group || !categorySearch.trim() || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const category = await categoryService.createCategory({ groupId: group.id, name: categorySearch.trim() });
      await refresh();
      setValue("category_id", category.id, { shouldDirty: true });
      setValue("category", category.name, { shouldDirty: true, shouldValidate: true });
      setCategorySearch("");
    } catch (error) { showError((error as Error).message); }
    finally { setCreatingCategory(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {editingProduct ? "Editar Producto" : "Nuevo Producto"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(data => { if (!validCategory) { showError("Selecciona una categoría activa del administrador"); return; } onSave({ ...data, category: validCategory.name }); })} className="space-y-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                {...register("name")}
                className="rounded-xl"
                placeholder="Nombre del producto"
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>SKU *</Label>
              <Input
                {...register("sku")}
                className="rounded-xl"
                placeholder="Código SKU"
              />
              {errors.sku && (
                <p className="text-xs text-red-500">{errors.sku.message}</p>
              )}
            </div>
            {editingProduct && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  Código de Barras
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={editingProduct.barcode}
                    readOnly
                    className="rounded-xl font-mono text-sm bg-muted/50"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Auto</span>
                </div>
              </div>
            )}
            <div className={editingProduct ? "" : "space-y-2"}>
              <Label>Tipo de artículo</Label>
              <Select
                value={formFamily}
                onValueChange={(v) => {
                  const fam = v as ProductFamily;
                  setValue("product_family", fam, { shouldDirty: true });
                  setValue("category_group", "", { shouldDirty: true });
                  setValue("category", "", { shouldDirty: true });
                  setValue("category_id", null, { shouldDirty: true });
                  setCategorySearch("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="productos">
                    <span className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5" />
                      Productos
                    </span>
                  </SelectItem>
                  <SelectItem value="servicios">
                    <span className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5" />
                      Servicios
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Familia</Label><p className="text-xs text-muted-foreground">Ejemplo: Carburador. Independiente del tipo Producto o Servicio.</p>
              <Select value={family?.id ?? ""} onValueChange={id => { setChosenFamily(id); setValue("category_group", ""); setValue("category_id", null); setValue("category", ""); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona una familia" /></SelectTrigger>
                <SelectContent>{catalog.families.map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grupo</Label><p className="text-xs text-muted-foreground">Ejemplo: Original o Alternativo.</p>
              <Select
                value={formCategoryGroup}
                onValueChange={(v) => {
                  setValue("category_group", v as CategoryGroup, { shouldDirty: true });
                  setValue("category", "", { shouldDirty: true });
                  setValue("category_id", null, { shouldDirty: true });
                  setCategorySearch("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formGroups.map((grp) => (
                    <SelectItem key={grp.key} value={grp.key}>
                      {grp.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoría administrada</Label><p className="text-xs text-muted-foreground">Ejemplo: STIHL o STIHL2, según el grupo.</p>
              <Input aria-label="Buscar o crear categoría" placeholder="Buscar categoría…" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} disabled={!group || catalogLoading} />
              <Select value={validCategory?.id ?? ""} onValueChange={chooseCategory} disabled={!group || catalogLoading || !!catalogError}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>{formCategories.filter(c => c.id === categoryId || c.name.toLocaleLowerCase().includes(categorySearch.toLocaleLowerCase())).map(c => <SelectItem key={c.id} value={c.id}><span className="flex items-center gap-2">{c.imageUrl && <img src={c.imageUrl} alt="" className="h-7 w-7 object-contain rounded" />}{c.name}</span></SelectItem>)}</SelectContent>
              </Select>
              {catalogError && <p role="alert" className="text-sm text-destructive">No se pudo cargar el catálogo. Recarga para reintentar.</p>}
              {!validCategory && editingProduct && <p className="text-sm text-amber-700">Clasificación anterior: {formCategory || editingProduct.category}. Selecciona una categoría activa para guardar.</p>}
              {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
              {canManage && group && categorySearch.trim() && <Button type="button" variant="outline" disabled={creatingCategory} onClick={() => void createCategory()}>Crear «{categorySearch.trim()}» en {group.label}</Button>}
            </div>
            <div className="space-y-2">
              <Label>Unidad</Label>
              <Select
                value={formUnit}
                onValueChange={(v) => setValue("unit", v)}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Precio (S/) *</Label>
              <Input
                type="number"
                {...register("price_soles", { valueAsNumber: true })}
                className="rounded-xl"
                placeholder="0.00"
              />
              {errors.price_soles && (
                <p className="text-xs text-red-500">{errors.price_soles.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Costo (S/)</Label>
              <Input
                type="number"
                {...register("cost_soles", { valueAsNumber: true })}
                className="rounded-xl"
                placeholder="0.00"
              />
            </div>
            {!editingProduct && (
              <div className="space-y-2">
                <Label>Stock Inicial</Label>
                <Input
                  type="number"
                  {...register("stock", { valueAsNumber: true })}
                  className="rounded-xl"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Stock Mínimo</Label>
              <Input
                type="number"
                {...register("min_stock", { valueAsNumber: true })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Stock Máximo</Label>
              <Input
                type="number"
                {...register("max_stock", { valueAsNumber: true })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Afectación IGV</Label>
              <Select
                value={formTaxAffectation}
                onValueChange={(v) => setValue("tax_affectation", v as TaxAffectation)}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TAX_AFFECTATION_TYPES).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input
                {...register("supplier")}
                className="rounded-xl"
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Tags / Marca
              </Label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border min-h-[42px] bg-background">
                {formTags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="flex-1 min-w-[80px] text-sm outline-none bg-transparent"
                  placeholder="Escribir tag + Enter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value;
                      if (val.trim()) {
                        addTag(val);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val.trim()) {
                      addTag(val);
                      e.target.value = "";
                    }
                  }}
                />
              </div>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Descripción</Label>
              <Input
                {...register("description")}
                className="rounded-xl"
                placeholder="Descripción del producto"
              />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Imagen del Producto
              </Label>
              <ImageUpload
                value={formImageUrl || null}
                onChange={(url) => setValue("image_url", url || "")}
                uploadFn={storageService.processAndUpload.bind(storageService)}
                previewClassName="w-32 h-32"
              />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label className="flex items-center gap-2">
                <Cog className="w-4 h-4" />
                Modelos de Máquina Compatibles
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {machineModels
                  .filter((m) => m.is_active)
                  .map((machine) => {
                    const selected = formSelectedMachineIds.includes(machine.id);
                    const catInfo = MACHINE_CATEGORIES[machine.category];
                    return (
                      <button
                        key={machine.id}
                        type="button"
                        onClick={() => toggleMachine(machine.id)}
                        className={
                          "p-2 rounded-xl border text-left text-xs transition-colors " +
                          (selected
                            ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700"
                            : "border-border hover:bg-muted/50")
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              "text-[9px] px-1.5 py-0.5 rounded-md font-medium " +
                              (catInfo?.color || "bg-slate-100 text-slate-600")
                            }
                          >
                            {catInfo?.label?.split(" ")[0] || "Otro"}
                          </span>
                        </div>
                        <p className="font-medium mt-1 truncate">{machine.name}</p>
                        <p className="text-muted-foreground text-[10px]">
                          {machine.brand} {"\u00B7"} {machine.model}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <PriceTiersEditor
                tiers={formPriceTiers}
                onChange={(tiers) => setValue("priceTiers", tiers)}
                basePriceSoles={formPriceSoles}
                costSoles={formCostSoles}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || catalogLoading || !!catalogError || !validCategory || creatingCategory}
              className="rounded-xl bg-orange-600 hover:bg-orange-700"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingProduct ? "Guardar Cambios" : "Crear Producto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
