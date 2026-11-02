import { describe, expect, it } from 'vitest';
import { groupProfit, profitAverages, type ProfitLine } from './product-profit';
import { profitWorkbook } from './product-profit-export';
import * as XLSX from 'xlsx';

const line=(extra:Partial<ProfitLine>={}):ProfitLine=>({id:'1',product_id:'p',sku:'0001',name:'Producto',category:'Repuestos',unit:'NIU',document:'B001-1',invoice_id:'i',date:'2026-10-18',type:'boleta',channel:'pos',branch_id:'b',stock_branch_id:'b',currency:'PEN',environment:'beta',operation:'sale',quality:'historical',quantity:1,revenue:2000,cost:500,cost_source:'Histórico',reference_item:null,...extra});
describe('Utilidad por producto',()=>{
  it('pondera por unidades y no promedia precios simples',()=>{
    const [g]=groupProfit([line(),line({id:'2',quantity:9,revenue:9000,cost:4500})]);
    expect(g.profit).toBe(6000);expect(profitAverages(g).price).toBe(1100);expect(profitAverages(g).cost).toBe(500);
  });
  it('mantiene costos pendientes fuera de la utilidad y del denominador del margen',()=>{
    const [g]=groupProfit([line(),line({id:'2',cost:null,quality:'pending',revenue:10000})]);
    expect(g.revenue).toBe(12000);expect(g.profit).toBe(1500);expect(g.pending).toBe(1);expect(profitAverages(g).margin).toBe(.75);expect(profitAverages(g).cost).toBeNull();
  });
  it('separa monedas y productos sin identidad',()=>{
    expect(groupProfit([line(),line({id:'2',currency:'USD'}),line({id:'3',product_id:null}),line({id:'4',product_id:null})])).toHaveLength(4);
  });
  it('mantiene notas sin revisar visibles fuera de los ingresos y unidades',()=>{
    const [g]=groupProfit([line(),line({id:'2',operation:'unassigned',quantity:-5,revenue:-10000,cost:null,quality:'pending'})]);
    expect(g.revenue).toBe(2000);expect(g.quantity).toBe(1);expect(g.pending).toBe(1);expect(g.lines).toHaveLength(2);
  });
  it('no exporta sumas monetarias ni utilidad de documentos con moneda desconocida',()=>{
    const source=line({currency:null,quality:'pending',cost:null});
    const [g]=groupProfit([source]);expect(profitAverages(g).price).toBeNull();
    const sheet=profitWorkbook([source],{}).Sheets['Utilidad por producto'];
    expect(sheet.F2).toBeUndefined();expect(sheet.I2).toBeUndefined();expect(sheet.K2).toBeUndefined();
  });
  it('resta devolución con costo original y descuenta ingresos sin alterar unidades',()=>{
    const [g]=groupProfit([line({quantity:2,revenue:4000,cost:1000}),line({id:'2',operation:'return',quantity:-1,revenue:-2000,cost:-500}),line({id:'3',operation:'adjustment',quantity:0,revenue:-200,cost:0})]);
    expect(g.quantity).toBe(1);expect(g.cost).toBe(500);expect(g.profit).toBe(1300);
  });
  it('no duplica anulaciones y evita dividir entre cero',()=>{
    const [g]=groupProfit([line(),line({id:'2',operation:'return',quantity:-1,revenue:-2000,cost:-500}),line({id:'3',operation:'excluded',quantity:0,revenue:0,cost:null})]);
    expect(g.lines).toHaveLength(2);expect(profitAverages(g)).toEqual({price:null,cost:null,profit:null,margin:null});
  });
  it('exporta tres hojas, códigos como texto y costos desconocidos vacíos',()=>{
    const book=profitWorkbook([line({cost:null,quality:'pending',name:'=1+1'})],{Desde:'2026-10-18',Hasta:'2026-10-18'});
    const saved=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
    expect(saved.SheetNames).toHaveLength(3);
    const sheet=saved.Sheets[saved.SheetNames[0]];
    expect(sheet.A2.v).toBe('0001');expect(sheet.B2.f).toBeUndefined();expect(sheet.K2).toBeUndefined();
  });
});
