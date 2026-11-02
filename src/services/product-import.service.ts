import { supabase, getCurrentOrgId } from '@/lib/supabase';
import { categoryService } from './category.service';
import type { ImportRow, ImportResult } from '@/lib/product-import';

export interface ImportOptions { branchId: string; batchId: string; mode: 'create' | 'update'; replaceTiers: boolean }
export const productImportService = {
  async catalogs() {
    const [families,groups,categories]=await Promise.all([categoryService.getFamilies(),categoryService.getGroups(),categoryService.getCategories()]);
    return categories.flatMap(c=>{
      const group=groups.find(g=>g.id===c.groupId),family=families.find(f=>f.id===group?.familyId);
      return group&&family&&['productos','servicios'].includes(family.key)&&['herramientas','repuestos','maquinas','transporte','maintenance'].includes(group.key)?[{familia:family.key,grupo:group.key,categoria:c.name}]:[];
    });
  },
  async run(rows: ImportRow[], options: ImportOptions, apply: boolean, expected: ImportResult[], progress: (done: number)=>void) {
    const results: ImportResult[]=[];
    for(let i=0;i<rows.length;i+=50) {
      const chunk=rows.slice(i,i+50).map(({errors:_,...r})=>({...r,...(apply?{expected:expected.find(e=>e.row===r.row)?.expected}: {})}));
      const {data,error}=await supabase.rpc('import_products',{
        p_organization_id:getCurrentOrgId(),p_branch_id:options.branchId,p_batch_id:options.batchId,p_rows:chunk,
        p_mode:options.mode,p_replace_tiers:options.replaceTiers,p_apply:apply,
      });
      if(error)throw new Error(error.code==='PGRST202'?'Falta aplicar la migración del importador en este backend.':error.message);
      results.push(...data as ImportResult[]);progress(Math.min(i+50,rows.length));
    }
    return results;
  },
};
