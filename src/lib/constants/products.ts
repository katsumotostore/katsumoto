export const MACHINE_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  macheteadora: { label: "Macheteadora / Desbrozadora", icon: "Scissors", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  fumigadora: { label: "Fumigadora", icon: "SprayCan", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  pulverizadora: { label: "Pulverizadora", icon: "Droplets", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  cosechadora: { label: "Cosechadora", icon: "Wheat", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  tractor: { label: "Tractor", icon: "Tractor", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  motosierra: { label: "Motosierra", icon: "TreePine", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  bomba: { label: "Bomba de Agua", icon: "Waves", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  generador: { label: "Generador / Planta", icon: "Zap", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  sembradora: { label: "Sembradora", icon: "Sprout", color: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400" },
  otro: { label: "Otro", icon: "Cog", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" },
};

export const MACHINE_CATEGORY_KEYS = Object.keys(MACHINE_CATEGORIES);

export const MACHINE_BRANDS = ["Stihl", "Husqvarna", "Honda", "Mitsubishi", "Zamora", "Shindaiwa", "Echo", "Dolmar", "Efco", "John Deere", "Massey Ferguson", "New Holland", "Kubota", "Yanmar", "Case IH", "Valtra", "Agromaster", "Locin", "Sipro", "Otra"] as const;

// ==========================================
// Unidades de Medida
// ==========================================
export const UNITS = ["Unidad", "Metro", "Litro", "Galón", "Kilogramo", "Tonelada", "Kit", "Juego", "Par", "Rollo", "Caja", "Saco", "Hora", "Servicio", "Viaje", "Kilómetro"] as const;
