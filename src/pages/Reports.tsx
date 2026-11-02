import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpHint } from "@/components/HelpHint";
import { AccountingReport } from "@/components/reports/AccountingReport";
import { SalesReport } from "@/components/reports/SalesReport";
import { ProductProfitReport } from "@/components/reports/ProductProfitReport";
import { FileText, BarChart3 } from "lucide-react";

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Reportes</h1>
          <HelpHint
            title="Módulo de Reportes"
            content="Reportes contables y de ventas. Exporta a CSV o Excel para tu contador."
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-4">
        Reportes generales para el área contable y comercial
      </p>

      <Tabs defaultValue="accounting" className="w-full">
        <TabsList className="rounded-xl h-auto flex-wrap justify-start">
          <TabsTrigger value="accounting" className="rounded-lg gap-2">
            <FileText className="w-4 h-4" />
            Reporte General Contable
          </TabsTrigger>
          <TabsTrigger value="sales" className="rounded-lg gap-2">
            <BarChart3 className="w-4 h-4" />
            Reporte de Ventas
          </TabsTrigger>
          <TabsTrigger value="profit" className="rounded-lg">Utilidad por producto</TabsTrigger>
        </TabsList>

        <TabsContent value="accounting" className="mt-4">
          <AccountingReport />
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <SalesReport />
        </TabsContent>
        <TabsContent value="profit" className="mt-4"><ProductProfitReport /></TabsContent>
      </Tabs>
    </div>
  );
}
