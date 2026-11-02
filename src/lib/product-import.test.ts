import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { importNumber, parseProductRows, PRODUCT_HEADERS, TIER_HEADERS, prepareProductTemplate, readProductFile } from './product-import';

const product=['000123','Filtro','productos','repuestos','Filtro de Aire','Unidad',25,15,50,5,200,'gravado','Proveedor','marca;filtro','Descripción','https://example.com/image.png'];
describe('product import contract',()=>{
  it('updates live catalogs and guidance while preserving template formatting',()=>{
    const source=readFileSync('public/templates/productos-v1.xlsx');
    const result=prepareProductTemplate(source,[{familia:'productos',grupo:'repuestos',categoria:'Filtro & nuevo'}]);
    const book=XLSX.read(result,{type:'array'});
    expect(book.Sheets.Catalogos.C2.v).toBe('Filtro & nuevo');
    expect(book.Sheets.Catalogos.C3).toBeUndefined();
    expect(book.Sheets.Guia.B2.v).toContain('Inventario > Importar');
    const zip=unzipSync(result);
    expect(strFromU8(zip['xl/worksheets/sheet5.xml'])).toContain('r="B2" s="12"');
    expect(strFromU8(zip['xl/worksheets/sheet1.xml'])).toContain('Catalogos!$F$2:$F$2');
    expect(book.SheetNames).toEqual(['Productos','Precios por volumen','Catalogos','Ejemplos','Guia']);
  });
  it('rejects real workbook formulas even when their cached value is valid',async()=>{
    const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([PRODUCT_HEADERS,product]);
    sheet.G2={t:'n',v:25,f:'20+5'};XLSX.utils.book_append_sheet(book,sheet,'Productos');
    const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'});
    await expect(readProductFile(new File([bytes],'products.xlsx'))).rejects.toThrow('fórmula');
  });
  it('preserves SKUs and separates the three stock quantities',()=>{
    const [r]=parseProductRows([PRODUCT_HEADERS,product]);
    expect(r.sku).toBe('000123');expect(r.stock).toBe(50);expect(r.fields.min_stock).toBe(5);expect(r.fields.max_stock).toBe(200);expect(r.fields.price_cents).toBe(2500);expect(r.errors).toEqual([]);
  });
  it('parses decimal comma without multiplying prices',()=>{expect(importNumber('12,50')).toBe(12.5);expect(importNumber('12.50')).toBe(12.5);for(const v of ['1,250','1.250,00','S/ 12','-5','NaN','12e3'])expect(()=>importNumber(v)).toThrow();});
  it('rejects fractional quantities rather than rounding',()=>{expect(()=>importNumber('2,5',true)).toThrow();expect(()=>importNumber(1.001)).toThrow();});
  it('preserves actual Excel row numbers and ignores blank rows',()=>{expect(parseProductRows([PRODUCT_HEADERS,[],product])[0].row).toBe(3);});
  it('joins optional scales by SKU',()=>{const [r]=parseProductRows([PRODUCT_HEADERS,product],[TIER_HEADERS,['000123','Mayorista',6,22],['000123','Especial',3,24]]);expect(r.tiers.map(t=>t.min_quantity)).toEqual([3,6]);expect(r.tiers[0].price_cents).toBe(2400);});
  it('rejects orphan tiers and duplicate thresholds',()=>{expect(()=>parseProductRows([PRODUCT_HEADERS,product],[TIER_HEADERS,['MISSING','Mayorista',6,22]])).toThrow('no existe');expect(parseProductRows([PRODUCT_HEADERS,product],[TIER_HEADERS,['000123','A',3,23],['000123','B',3,22]])[0].errors).toContain('Cantidades de escala duplicadas');});
  it('detects duplicated SKUs before batching',()=>{expect(parseProductRows([PRODUCT_HEADERS,product,product]).every(r=>r.errors.includes('SKU duplicado en Productos'))).toBe(true);});
  it('requires SKU text and rejects literal formulas',()=>{const p=[...product];p[0]=123;expect(parseProductRows([PRODUCT_HEADERS,p])[0].errors.join()).toContain('texto');p[0]='000123';p[6]='=2+2';expect(parseProductRows([PRODUCT_HEADERS,p])[0].errors.join()).toContain('fórmulas');});
  it('rejects duplicate mapping and unknown columns',()=>{expect(()=>parseProductRows([['SKU','Nombre','Nombre del producto'],['A','B','C']])).toThrow('duplicados');expect(()=>parseProductRows([['SKU','precio raro'],['A',5]])).toThrow('desconocidas');});
  it('keeps update blanks absent instead of resetting to zero',()=>{const [r]=parseProductRows([PRODUCT_HEADERS,['000123','Nuevo nombre']]);expect(r.fields).toEqual({name:'Nuevo nombre'});expect(r.stock).toBe(0);});
  it('accepts original template threshold columns without replacing base price',()=>{const [r]=parseProductRows([['SKU','Nombre del producto','Precio (S/)','Precio especial 3','Precio Mayorista 6','Precio Distribuidor 20'],['A','Producto',25,24,22,20]]);expect(r.fields.price_cents).toBe(2500);expect(r.tiers.map(t=>t.price_cents)).toEqual([2400,2200,2000]);});
});
