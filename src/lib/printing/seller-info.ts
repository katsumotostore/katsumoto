import { supabase, getCurrentOrgId } from "@/lib/supabase";

export interface SellerInfo {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  departamento: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  phone: string;
  email: string;
  logoUrl?: string;
  ticketFooter?: string;
  branchAddress?: string;
}

export async function getSellerInfo(branchId?: string): Promise<SellerInfo> {
  const orgId = await getCurrentOrgId();

  const [orgResult, sunatResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("ruc, name, address, phone, email, logo_url")
      .eq("id", orgId)
      .single(),
    supabase
      .from("sunat_config")
      .select("ruc, razon_social, nombre_comercial, direccion, ubigeo, departamento, provincia, distrito, ticket_footer")
      .eq("organization_id", orgId)
      .single(),
  ]);

  const org = orgResult.data;
  const sunat = sunatResult.data;
  let phone = org?.phone || "";
  let branchAddress: string | undefined;
  if (branchId) {
    const { data: branch, error } = await supabase
      .from("branches")
      .select("phone, address")
      .eq("organization_id", orgId)
      .eq("id", branchId)
      .single();
    if (error) throw error;
    if (!branch) throw new Error("No se encontro la sede del comprobante");
    phone = branch.phone?.trim() || "";
    branchAddress = branch.address?.trim() || undefined;
  }

  return {
    ruc: sunat?.ruc || org?.ruc || "",
    razonSocial: sunat?.razon_social || org?.name || "",
    nombreComercial: sunat?.nombre_comercial || org?.name || "",
    direccion: sunat?.direccion || org?.address || "",
    departamento: sunat?.departamento || "",
    provincia: sunat?.provincia || "",
    distrito: sunat?.distrito || "",
    ubigeo: sunat?.ubigeo || "",
    phone,
    branchAddress,
    email: org?.email || "",
    logoUrl: org?.logo_url || undefined,
    ticketFooter: sunat?.ticket_footer || undefined,
  };
}
