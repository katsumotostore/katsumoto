import { describe, expect, it } from "vitest";
import { activeCatalog, catalogCategories, catalogTree, type ManagedCatalog } from "./managed-catalog";
const data: ManagedCatalog = {
  families: [
    {id:'f1',key:'productos',label:'Productos',icon:'',color:'',activeColor:'',order:0},
    {id:'f2',key:'servicios',label:'Servicios',icon:'',color:'',activeColor:'',order:1},
    {id:'legacy',key:'n',label:'n',icon:'',color:'',activeColor:'',order:2},
  ],
  groups: [
    {id:'g1',key:'repuestos',familyId:'f1',label:'Repuestos',icon:'',color:'',order:0},
    {id:'g2',key:'nuevo_grupo',familyId:'f2',label:'Trabajos',icon:'',color:'',order:1},
    {id:'g3',key:'archivado',familyId:'f1',label:'Antiguo',icon:'',color:'',order:2,isActive:false},
  ],
  categories: [
    {id:'c1',groupId:'g1',name:'Otros',order:0,imageUrl:null},
    {id:'c2',groupId:'g2',name:'Otros',order:0,imageUrl:null},
    {id:'c3',groupId:'g3',name:'Hija de archivado',order:0,imageUrl:null},
    {id:'c4',groupId:'g1',name:'Archivada',order:1,imageUrl:null,isActive:false},
  ],
};
describe('catálogo administrado',()=>{
  it('excluye tipos heredados y ramas archivadas sin perder los datos de origen',()=>{
    const active=activeCatalog(data);
    expect(active.families.map(f=>f.key)).toEqual(['productos','servicios']);
    expect(active.categories.map(c=>c.id)).toEqual(['c1','c2']);
    expect(data.categories).toHaveLength(4);
  });
  it('admite grupos nuevos y distingue categorías homónimas mediante ID',()=>{
    const active=activeCatalog(data);
    expect(catalogCategories(active,'servicios','all').map(c=>c.id)).toEqual(['c2']);
    expect(catalogCategories(active,'all','nuevo_grupo').map(c=>c.id)).toEqual(['c2']);
    expect(catalogCategories(active,'productos','nuevo_grupo')).toEqual([]);
    expect(catalogCategories(active,'all','all')).toHaveLength(2);
  });
  it('construye la navegación de tienda desde los mismos grupos administrados',()=>{
    const tree=catalogTree(activeCatalog(data));
    expect(tree.servicios.groups.nuevo_grupo.label).toBe('Trabajos');
    expect(tree.productos.groups.archivado).toBeUndefined();
  });
});
