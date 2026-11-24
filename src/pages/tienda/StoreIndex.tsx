import { useState, useMemo, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useSearchParams } from "react-router-dom";
import { useStorePublicProducts, useStorePublicBranches, useStorePublicStock } from "@/hooks/useStorePublic";
import { useCart } from "@/components/store/CartContext";
import { formatCents } from "@/lib/format";
import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { catalogCategories } from "@/lib/managed-catalog";
import { getBranchStock, getStoreStockBranchId } from "@/lib/utils/stock";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, Truck, Shield, Headphones, Package, Briefcase,
  Cog as CogIcon, ArrowRight, X, Zap, Star,
  CheckCircle, Phone, MapPin, ChevronRight, ShoppingCart,
  MessageCircle,
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { STORE_CONFIG, getWhatsAppUrl } from "@/lib/store-config";


const familyIcons: Record<string, React.ComponentType<{ className?: string }>> = { productos: Package, servicios: Briefcase };

export default function StoreIndex() {
  const { catalog, tree: categoryTree } = useManagedCatalog();
  const categoryCards = catalog.groups.map(g => ({ group:g.key,label:g.label,desc:catalog.families.find(f=>f.id===g.familyId)?.label ?? "",icon:Package,color:"from-orange-500 to-orange-600",bg:"bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900" }));
  const { data: allProducts = [] } = useStorePublicProducts();
  const { data: branches = [] } = useStorePublicBranches();
  const { data: branchStocks = [] } = useStorePublicStock();
  const { addItem, syncProducts } = useCart();

  useEffect(() => {
    if (allProducts.length > 0) syncProducts(allProducts);
  }, [allProducts, syncProducts]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const storeStockBranchId = useMemo(() => getStoreStockBranchId(branches), [branches]);

  const getStoreStock = useMemo(() => {
    if (!storeStockBranchId || branchStocks.length === 0) return (_productId: string) => 0;
    return (productId: string) => getBranchStock(branchStocks, storeStockBranchId, productId);
  }, [branchStocks, storeStockBranchId]);

  const familyFilter = searchParams.get("family") || "all";
  const groupFilter = searchParams.get("group") || "all";
  const searchQuery = searchParams.get("search") || "";

  useEffect(() => {
    if (searchQuery || familyFilter !== "all" || groupFilter !== "all") {
      setTimeout(() => {
        document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [searchQuery, familyFilter, groupFilter]);

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") params.delete(key);
    else params.set(key, value);
    if (key === "family") params.delete("group");
    if (key === "group") params.delete("family");
    setSearchParams(params);
    setSelectedCategory("all");
  };

  const clearFilters = () => {
    setSearchParams({});
    setSearch("");
    setSelectedCategory("all");
  };

  const products = useMemo(() => {
    return allProducts.filter(p => {
      if (!p.is_active) return false;
      const q = (debouncedSearch || searchQuery).toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
      if (familyFilter !== "all" && p.product_family !== familyFilter) return false;
      if (groupFilter !== "all" && p.category_group !== groupFilter) return false;
      if (selectedCategory !== "all" && p.category_id !== selectedCategory) return false;
      return true;
    });
  }, [allProducts, familyFilter, groupFilter, selectedCategory, debouncedSearch, searchQuery]);

  const allCategories = useMemo(() => catalogCategories(catalog, familyFilter, groupFilter), [catalog, familyFilter, groupFilter]);

  const featuredProducts = useMemo(() =>
    products.filter(p => p.is_active && getStoreStock(p.id) > 0).slice(0, 4),
    [products, getStoreStock]
  );

  const handleAdd = (product: typeof products[0]) => {
    const maxStock = getStoreStock(product.id);
    const added = addItem(product, maxStock);
    if (added) {
      showSuccess(`${product.name} agregado al carrito`);
    } else {
      showError("Stock insuficiente");
    }
  };

  const hasActiveFilter = familyFilter !== "all" || groupFilter !== "all" || selectedCategory !== "all" || search !== "" || searchQuery !== "";

  return (
    <div>
      {/* HERO */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-orange-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-amber-500/10 to-transparent rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 md:py-20 relative">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 rounded-xl px-3 py-1.5 text-xs font-semibold mb-5 border">
                <Zap className="w-3 h-3 mr-1.5" />
                Tienda Online — DESPACHO A TODO EL PERÚ
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-5 tracking-tight">
                Repuestos para
                <span className="block bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">tu maquinaria</span>
              </h1>
              <p className="text-slate-300 text-base md:text-lg leading-relaxed mb-8 max-w-lg">
                Repuestos, maquinaria y servicios agroindustriales de calidad. Más de 5 años brindando soluciones confiables y apoyando el desarrollo del sector agrícola en Junín y la Selva Central.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => { setFilter("family", "productos"); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); }} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl h-12 px-7 font-bold text-white shadow-lg shadow-orange-500/25 border-0">
                  <Package className="w-5 h-5 mr-2" />Ver Productos
                </Button>
                <Button onClick={() => { setFilter("family", "servicios"); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); }} variant="outline" className="bg-transparent border-slate-600 text-slate-300 hover:bg-white/10 hover:text-white rounded-xl h-12 px-7 font-semibold">
                  <Briefcase className="w-5 h-5 mr-2" />Servicios
                </Button>
              </div>
              <div className="flex gap-8 mt-10">
                {[
                  { value: "500+", label: "Productos" },
                  { value: "24h", label: "Despacho" },
                  { value: "100%", label: "Garantía" },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-2xl font-extrabold text-white">{s.value}</p>
                    <p className="text-xs text-slate-400 font-medium">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-3xl blur-2xl" />
                <div className="relative bg-white/10 backdrop-blur-md rounded-3xl border border-white/10 p-6 shadow-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center"><Star className="w-4 h-4 text-white" /></div>
                    <span className="text-sm font-bold text-white">Más vendido</span>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-28 h-28 bg-slate-700/50 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <CogIcon className="w-12 h-12 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg leading-tight">{featuredProducts[0]?.name || "Rodamiento SKF 6205"}</p>
                      <p className="text-sm text-slate-400 mt-1">{featuredProducts[0]?.category || "Rodamientos"}</p>
                      <p className="text-2xl font-extrabold text-orange-400 mt-3">{featuredProducts[0] ? formatCents(featuredProducts[0].price_cents) : "S/. 35.00"}</p>
                      <Button onClick={() => featuredProducts[0] && handleAdd(featuredProducts[0])} className="mt-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white h-9 px-5 text-sm font-bold border-0">
                        <ShoppingCart className="w-4 h-4 mr-1.5" />Agregar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {[
              { icon: Truck, label: "Despacho rápido", desc: "A todo Junín y selva central" },
              { icon: Shield, label: "Garantía total", desc: "En todos nuestros productos" },
              { icon: Headphones, label: "Soporte técnico", desc: "Asesoría especializada" },
              { icon: CheckCircle, label: "Pago seguro", desc: "Yape, Plin, transferencia" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">Explora por categoría</h2>
            <p className="text-sm text-muted-foreground mt-2">Encuentra exactamente lo que necesitas</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categoryCards.map(cat => {
              const Icon = cat.icon;
              return (
                <button key={cat.group} onClick={() => setFilter("group", cat.group)} className={`group p-6 rounded-2xl border-2 text-left transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${cat.bg} hover:border-orange-300 dark:hover:border-orange-700`}>
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">{cat.label}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{cat.desc}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-orange-600 dark:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Ver productos <ArrowRight className="w-3 h-3" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURED */}
      <section className="py-12 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5 text-orange-500" />
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Productos destacados</h2>
              </div>
              <p className="text-sm text-muted-foreground">Los más populares entre nuestros clientes</p>
            </div>
            <Button variant="outline" onClick={() => { clearFilters(); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl text-sm font-semibold">
              Ver todo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {featuredProducts.map(product => (
              <StoreProductCard key={product.id} product={product} onAdd={handleAdd} featured availableStock={getStoreStock(product.id)} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER — Functional buttons */}
      <section className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-amber-300 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 relative">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">¿No encuentras el repuesto?</h2>
            <p className="text-orange-100 text-base mb-8 leading-relaxed">
              Nuestro equipo de soporte técnico te ayuda a encontrar exactamente lo que necesitas. Cotizaciones sin compromiso.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href={STORE_CONFIG.phoneHref}>
                <Button className="bg-white text-orange-700 hover:bg-orange-50 rounded-xl h-12 px-8 font-bold shadow-lg">
                  <Phone className="w-4 h-4 mr-2" />Llamar ahora
                </Button>
              </a>
              <a href={getWhatsAppUrl("Hola, necesito asesoría sobre un repuesto")} target="_blank" rel="noopener noreferrer">
                <Button className="bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl h-12 px-8 font-bold shadow-lg border-0">
                  <MessageCircle className="w-4 h-4 mr-2" />WhatsApp
                </Button>
              </a>
              <a href={STORE_CONFIG.addressMapUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="bg-transparent border-white/30 text-white hover:bg-white/10 rounded-xl h-12 px-8 font-semibold">
                  <MapPin className="w-4 h-4 mr-2" />Visitar tienda
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CATALOG */}
      <section id="catalog" className="bg-white dark:bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Catálogo completo</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{products.length} productos disponibles</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar productos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl h-10" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="rounded-xl text-xs text-orange-600 hover:text-orange-700">
                  <X className="w-3 h-3 mr-1" />Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Family Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none pb-1">
            {[
              { key: "all", label: "Todo", icon: Package },
              ...Object.entries(categoryTree).map(([key, val]) => ({ key, label: val.label, icon: familyIcons[key] || Package })),
            ].map(fam => (
              <button key={fam.key} onClick={() => setFilter("family", fam.key)} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${familyFilter === fam.key && groupFilter === "all" ? "bg-orange-600 text-white shadow-md shadow-orange-500/20" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                <fam.icon className="w-4 h-4" />{fam.label}
              </button>
            ))}
          </div>

          {/* Category Pills */}
          {allCategories.length > 0 && (
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
              <button onClick={() => setSelectedCategory("all")} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === "all" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800" : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                Todas
              </button>
              {allCategories.map(cat => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === cat.id ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800" : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Products Grid */}
          {products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map(product => (
                <StoreProductCard key={product.id} product={product} onAdd={handleAdd} availableStock={getStoreStock(product.id)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Package className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
              <p className="text-lg font-semibold text-slate-900 dark:text-white">No se encontraron productos</p>
              <p className="text-sm text-muted-foreground mt-1">Intenta con otra búsqueda o categoría</p>
              <Button variant="outline" className="rounded-xl mt-4" onClick={clearFilters}>Ver todo el catálogo</Button>
            </div>
          )}
        </div>
      </section>

      {/* Sección: Conviértete en Distribuidor */}
      <section className="py-16 bg-gradient-to-br from-orange-950 via-slate-900 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 rounded-xl px-3 py-1.5 text-xs font-semibold mb-4 border">
                <Briefcase className="w-3 h-3 mr-1.5" />Oportunidad de Negocio
              </Badge>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Conviértete en Distribuidor</h2>
              <p className="text-slate-300 text-lg leading-relaxed mb-6">
                Únete a nuestra red de distribuidores autorizados. Vende repuestos y productos agroindustriales bajo la marca Katsumoto. Te brindamos precios especiales, capacitación, material de marketing y soporte continuo.
              </p>
              <div className="space-y-3">
                {[
                  "Precios preferenciales para distribuidores",
                  "Capacitación técnica en productos",
                  "Material de marketing y catálogos",
                  "Soporte y asesoría personalizada",
                  "Entrega a todo el Perú",
                ].map(b => (
                  <div key={b} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-orange-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                    </div>
                    <span className="text-sm text-slate-300">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-white mb-6">Quiero ser distribuidor</h3>
              <form id="distributor-form" className="space-y-4" onSubmit={e => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const data = Object.fromEntries(new FormData(form));
                const msg = `Hola, quiero ser distribuidor Katsumoto.%0A%0ANombre: ${data.nombre}%0AEmpresa: ${data.empresa}%0ACiudad: ${data.ciudad}%0ATeléfono: ${data.telefono}%0ACorreo: ${data.email}%0AExperiencia: ${data.experiencia}%0AMensaje: ${data.mensaje}`;
                window.open(`https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${msg}`, '_blank');
              }}>
                <input name="nombre" placeholder="Nombre completo" required className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500" />
                <input name="empresa" placeholder="Empresa o negocio" className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500" />
                <input name="ciudad" placeholder="Ciudad / Región" required className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500" />
                <input name="telefono" placeholder="Teléfono" required className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500" />
                <input name="email" type="email" placeholder="Correo electrónico" required className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500" />
                <select name="experiencia" required className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500">
                  <option value="" className="bg-slate-800">Experiencia en ventas agroindustriales</option>
                  <option value="principiante" className="bg-slate-800">Principiante (sin experiencia)</option>
                  <option value="intermedio" className="bg-slate-800">Intermedio (1-3 años)</option>
                  <option value="avanzado" className="bg-slate-800">Avanzado (3-5 años)</option>
                  <option value="experto" className="bg-slate-800">Experto (más de 5 años)</option>
                </select>
                <textarea name="mensaje" placeholder="Mensaje (opcional)" rows={3} className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-orange-500" />
                <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl h-11 font-bold text-white">
                  Quiero ser distribuidor
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: Trabaja con Nosotros */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <Badge className="bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-500/30 rounded-xl px-3 py-1.5 text-xs font-semibold mb-4 border">
            <Briefcase className="w-3 h-3 mr-1.5" />Únete al Equipo
          </Badge>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Trabaja con Nosotros</h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg mb-8">
            ¿Te apasiona el mundo agroindustrial? Queremos conocerte. Envíanos tu CV y cuéntanos cómo puedes aportar al equipo Katsumoto.
          </p>
          <Button onClick={() => window.open(`https://wa.me/${STORE_CONFIG.whatsappNumber}?text=Hola,%20me%20interesa%20formar%20parte%20del%20equipo%20Katsumoto.%20Adjunto%20mi%20CV.`, '_blank')} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl h-12 px-8 font-bold text-white shadow-lg shadow-orange-500/25">
            <MessageCircle className="w-5 h-5 mr-2" />Postular por WhatsApp
          </Button>
        </div>
      </section>

    </div>
  );
}
