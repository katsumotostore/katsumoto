export const queryKeys = {
  products: {
    all: ["products"] as const,
    barcodeConflicts: ["products", "barcode-conflicts"] as const,
    detail: (id: string) => ["products", id] as const,
    branchStock: (branchId: string) => ["products", "branch-stock", branchId] as const,
    tiers: (productId: string) => ["products", "tiers", productId] as const,
    allTiers: ["products", "all-tiers"] as const,
    machines: (productId: string) => ["products", "machines", productId] as const,
  },
  clients: {
    all: ["clients"] as const,
    detail: (id: string) => ["clients", id] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    detail: (id: string) => ["invoices", id] as const,
    branch: (branchId: string) => ["invoices", "branch", branchId] as const,
  },
  branches: {
    all: ["branches"] as const,
    detail: (id: string) => ["branches", id] as const,
    stock: (branchId: string) => ["branches", "stock", branchId] as const,
    allStock: ["branches", "all-stock"] as const,
  },
  machines: {
    all: ["machines"] as const,
    detail: (id: string) => ["machines", id] as const,
    productMachines: ["machines", "product-machines"] as const,
  },
  registers: {
    all: ["registers"] as const,
    branch: (branchId: string) => ["registers", "branch", branchId] as const,
    transactions: (registerId: string) => ["registers", "transactions", registerId] as const,
  },
  movements: {
    all: ["movements"] as const,
    branch: (branchId: string) => ["movements", "branch", branchId] as const,
    product: (productId: string) => ["movements", "product", productId] as const,
  },
  orders: {
    all: ["orders"] as const,
    detail: (id: string) => ["orders", id] as const,
  },
  sunat: {
    config: ["sunat-config"] as const,
    summaryLogs: ["sunat-summary-logs"] as const,
  },
  despatches: {
    all: ["despatches"] as const,
    detail: (id: string) => ["despatches", id] as const,
  },
  reports: {
    accounting: (dateFrom: string, dateTo: string, branchId: string) =>
      ["reports", "accounting", dateFrom, dateTo, branchId] as const,
    sales: (dateFrom: string, dateTo: string, branchId: string) =>
      ["reports", "sales", dateFrom, dateTo, branchId] as const,
  },
} as const;
