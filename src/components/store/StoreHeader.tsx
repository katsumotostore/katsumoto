import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCart } from "./CartContext";
import {
  Wheat, ShoppingCart, Search, Phone, Truck, Shield,
  ChevronDown, Package, Wrench, Cog, Briefcase,
  Menu, X, Headphones, MapPin, MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";

import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { STORE_CONFIG, getWhatsAppUrl } from "@/lib/store-config";

const categoryIconMap: Record<string, LucideIcon> = {
  Package, Wrench, Cog, Briefcase, Truck,
};

export function StoreHeader() {
  const { tree: categoryTree } = useManagedCatalog();
const categoryNavItems = [
  { key: "all", label: "Todo", icon: null },
  ...Object.entries(categoryTree).flatMap(([, fam]) =>
    Object.entries(fam.groups).map(([gKey, gVal]) => ({
      key: gKey,
      label: gVal.label,
      icon: gVal.icon,
    }))
  ),
];


  const { totalItems } = useCart();
  const _location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [catDropdown, setCatDropdown] = useState(false);

  useEffect(() => {
    if (debouncedSearch.trim()) {
      navigate(`/?search=${encodeURIComponent(debouncedSearch.trim())}`);
    }
  }, [debouncedSearch, navigate]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCatDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/?search=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleWhatsApp = () => {
    window.open(getWhatsAppUrl(), "_blank");
  };

  return (
    <header className="sticky top-0 z-50">
      {/* Announcement Bar */}
      <div className="bg-gradient-to-r from-orange-800 via-orange-700 to-amber-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-9 text-[11px] font-medium">
          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Truck className="w-3.5 h-3.5 flex-shrink-0" />
              DESPACHO A TODO EL PERÚ
            </span>
            <span className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <Shield className="w-3.5 h-3.5 flex-shrink-0" />
              Garantía en todos los productos
            </span>
            <span className="hidden md:flex items-center gap-1.5 whitespace-nowrap">
              <Headphones className="w-3.5 h-3.5 flex-shrink-0" />
              Soporte: {STORE_CONFIG.wasaDisplay}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-1.5 hover:text-white/80 transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-4 h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-shadow">
                <Wheat className="w-5.5 h-5.5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-extrabold text-lg leading-tight text-slate-900 dark:text-white tracking-tight">Katsumoto</h1>
                <p className="text-[9px] text-orange-600 dark:text-orange-400 font-semibold uppercase tracking-widest -mt-0.5">Repuestos y Maquinaria</p>
              </div>
            </Link>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-auto hidden sm:flex">
              <div className="relative w-full flex">
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setCatDropdown(!catDropdown)}
                    className="h-10 px-3 bg-slate-100 dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 rounded-l-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    Todo
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {catDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-2 max-h-72 overflow-auto">
                      <button
                        onClick={() => { setCatDropdown(false); }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
                      >
                        Todas las categorías
                      </button>
                      {Object.entries(categoryTree).map(([famKey, fam]) => (
                        <div key={famKey}>
                          <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{fam.label}</p>
                          {Object.entries(fam.groups).map(([gKey, gVal]) => (
                            <button
                              key={gKey}
                              onClick={() => { setCatDropdown(false);                         navigate(`/?group=${gKey}`); }}
                              className="w-full px-4 py-2 text-left text-xs text-slate-600 dark:text-slate-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-700 dark:hover:text-orange-400 transition-colors flex items-center gap-2"
                            >
                              {gVal.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar repuestos, herramientas, máquinas..."
                  className="flex-1 h-10 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                />
                <button
                  type="submit"
                  className="h-10 px-5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-r-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden lg:inline text-sm font-semibold">Buscar</span>
                </button>
              </div>
            </form>

            {/* Right Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                to="/"
                className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                <span className="text-xs">Pichanaki</span>
              </Link>

              <Link to="/carrito" className="relative group">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                  <div className="relative">
                    <ShoppingCart className="w-5 h-5 text-slate-700 dark:text-slate-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors" />
                    {totalItems > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-gradient-to-r from-orange-500 to-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-bounce-once">
                        {totalItems}
                      </span>
                    )}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-[10px] text-slate-400 leading-none">Carrito</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-tight">{totalItems} ítem{totalItems !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </Link>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="sm:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {mobileOpen ? (
                  <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                ) : (
                  <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none -mx-1 px-1 py-0">
            {categoryNavItems.slice(0, 9).map((item) => {
              const Icon = item.icon ? (categoryIconMap[item.icon] || Package) : null;
              return (
                <Link
                  key={item.key}
                  to={item.key === "all" ? "/" : `/?group=${item.key}`}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                    (item.key === "all" ? !searchParams.get("group") : searchParams.get("group") === item.key)
                      ? "border-orange-500 text-orange-700 dark:text-orange-400"
                      : "border-transparent text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-300"
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {item.label}
                </Link>
              );
            })}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setCatDropdown(!catDropdown)}
                className="flex items-center gap-1 px-3.5 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
              >
                Más <ChevronDown className={`w-3 h-3 transition-transform ${catDropdown ? "rotate-180" : ""}`} />
              </button>
              {catDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 min-w-[160px]">
                  {categoryNavItems.map((item) => (
                    <Link
                      key={item.key}
                      to={item.key === "all" ? "/" : `/?group=${item.key}`}
                      onClick={() => setCatDropdown(false)}
                      className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="sm:hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="p-4">
            <form onSubmit={handleSearch} className="mb-4">
              <div className="flex">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar productos..."
                  className="flex-1 h-10 px-4 rounded-l-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
                <button type="submit" className="h-10 px-4 bg-orange-600 text-white rounded-r-xl">
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </form>
            <div className="space-y-1">
              {categoryNavItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.key === "all" ? "/" : `/?group=${item.key}`}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            {/* Mobile contact buttons */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <a
                href="tel:+5164222333"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                <Phone className="w-4 h-4 text-orange-500" />
                {STORE_CONFIG.phone}
              </a>
              <button
                onClick={() => { handleWhatsApp(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#25D366] hover:bg-green-50 dark:hover:bg-green-900/20 w-full text-left"
              >
                <MessageCircle className="w-4 h-4" />
                  WhatsApp: {STORE_CONFIG.whatsappDisplay}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}