import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export const PRODUCT_HEADERS = ['SKU *', 'Nombre del producto *', 'Familia *', 'Grupo *', 'Categoria *', 'Unidad *', 'Precio unitario final (S/) *', 'Costo unitario (S/)', 'Stock inicial', 'Stock minimo', 'Stock maximo', 'Afectacion IGV *', 'Proveedor', 'Etiquetas', 'Descripcion', 'Imagen URL'];
export const TIER_HEADERS = ['SKU *', 'Etiqueta *', 'Desde cantidad *', 'Precio unitario final (S/) *'];
export interface ImportRow { row: number; sku: string; fields: Record<string, unknown>; stock: number; tiers: { label: string; min_quantity: number; price_cents: number }[]; errors: string[] }
export interface ImportResult { row: number; sku: string; status: 'created' | 'updated' | 'skipped' | 'error'; message?: string; product_id?: string; expected?: string; before?: Record<string, unknown>; after?: Record<string, unknown>; stock?: number; tiers?: unknown[] }
const keys = ['sku','name','product_family','category_group','category','unit','price_cents','cost_cents','stock','min_stock','max_stock','tax_affectation','supplier','tags','description','image_url'];
export const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\*/g, '').replace(/[_]/g, ' ').replace(/\s+/g, ' ').trim();
const aliases: Record<string, string> = Object.fromEntries(PRODUCT_HEADERS.map((h, i) => [normalizeHeader(h), keys[i]]));
Object.assign(aliases, { nombre:'name', 'grupo de categoria':'category_group', categoria:'category', 'precio (s/)':'price_cents', 'precio venta (s/.)':'price_cents', 'costo (s/)':'cost_cents', 'costo (s/.)':'cost_cents', 'stock actual':'stock', 'tags / marca':'tags', 'tags (separados por ;)':'tags', 'imagen del producto (url o ruta)':'image_url', 'familia (productos/servicios)':'product_family', 'grupo (repuestos/herramientas/...)':'category_group', 'afectacion igv':'tax_affectation' });
export function importNumber(value: unknown, integer = false): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))) throw new Error('Número inválido: usa números sin separadores de miles ni símbolos');
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n)) || (!integer && Math.abs(n * 100 - Math.round(n * 100)) > 0.00001)) throw new Error(integer ? 'Debe ser un entero no negativo' : 'Usa un importe no negativo con hasta 2 decimales');
  if (n > 100000000) throw new Error('Valor fuera del límite permitido');
  return n;
}
const blank = (v: unknown) => v == null || String(v).trim() === '';
function readSheet(sheet: XLSX.WorkSheet, name: string): unknown[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (range.e.r > 20001 || range.e.c > 60) throw new Error(`${name}: hoja demasiado grande (máximo 20.000 filas y 61 columnas)`);
  for (const [cell, value] of Object.entries(sheet)) if (!cell.startsWith('!') && value?.f) throw new Error(`${name}!${cell}: reemplaza la fórmula por su valor`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: true });
}
export function parseProductRows(data: unknown[][], tierData: unknown[][] = []): ImportRow[] {
  if (!data.length) throw new Error('La hoja Productos está vacía');
  const mapped = data[0].map(h => aliases[normalizeHeader(h)] || (['precio especial 3','precio mayorista 6','precio distribuidor 20'].includes(normalizeHeader(h)) ? normalizeHeader(h) : null));
  const nonempty = data[0].filter(h => !blank(h)).map(normalizeHeader);
  if (new Set(nonempty).size !== nonempty.length || new Set(mapped.filter(Boolean)).size !== mapped.filter(Boolean).length) throw new Error('Hay encabezados duplicados o dos columnas para el mismo campo');
  if (!mapped.includes('sku')) throw new Error('Falta la columna SKU');
  const unknown = data[0].filter((h,i) => !blank(h) && !mapped[i]);
  if (unknown.length) throw new Error(`Columnas desconocidas: ${unknown.join(', ')}. Usa la plantilla descargable.`);
  const rows: ImportRow[] = [];
  for (let i=1;i<data.length;i++) {
    if (data[i].every(blank)) continue;
    const row: ImportRow = {row:i+1,sku:'',fields:{},stock:0,tiers:[],errors:[]};
    data[i].forEach((value,j) => {
      if (blank(value)) return;
      const key=mapped[j];
      if (!key) {row.errors.push(`Columna ${j+1}: datos sin encabezado`);return;}
      try {
        if (typeof value === 'string' && value.trim().startsWith('=')) throw new Error('No se admiten fórmulas');
        if (key === 'stock') row.stock=importNumber(value,true);
        else if (key.startsWith('precio ')) row.tiers.push({label:key.includes('especial')?'Especial':key.includes('mayorista')?'Mayorista':'Distribuidor',min_quantity:Number(key.split(' ').at(-1)),price_cents:Math.round(importNumber(value)*100)});
        else if (['price_cents','cost_cents'].includes(key)) row.fields[key]=Math.round(importNumber(value)*100);
        else if (['min_stock','max_stock'].includes(key)) row.fields[key]=importNumber(value,true);
        else if (key==='tags') row.fields[key]=String(value).split(';').map(s=>s.trim()).filter(Boolean);
        else if (key==='sku') { if(typeof value!=='string') throw new Error('SKU debe ser texto para conservar ceros iniciales'); row.sku=value.trim(); }
        else row.fields[key]=String(value).trim();
      } catch(error) {row.errors.push(`${data[0][j]}: ${(error as Error).message}`);}
    });
    if (!row.sku) row.errors.push('SKU requerido');
    rows.push(row);
  }
  if (!rows.length || rows.length>5000) throw new Error('Carga entre 1 y 5.000 productos');
  const counts=new Map<string,number>();rows.forEach(r=>counts.set(r.sku,(counts.get(r.sku)||0)+1));
  rows.forEach(r=>{if((counts.get(r.sku)||0)>1)r.errors.push('SKU duplicado en Productos');});
  if (tierData.length) {
    const th=tierData[0].map(normalizeHeader), expected=TIER_HEADERS.map(normalizeHeader);
    if (th.filter(Boolean).length!==4 || expected.some(h=>th.indexOf(h)<0) || new Set(th.filter(Boolean)).size!==4) throw new Error('Precios por volumen: usa las cuatro columnas de la plantilla');
    const ids=expected.map(h=>th.indexOf(h));
    for(let i=1;i<tierData.length;i++) {
      if(tierData[i].every(blank))continue;
      const [sku,label,qty,price]=ids.map(j=>tierData[i][j]);
      const row=rows.find(r=>r.sku===String(sku).trim());
      if(!row)throw new Error(`Precios por volumen, fila ${i+1}: SKU ${sku} no existe en Productos`);
      try { if(typeof sku!=='string')throw new Error('SKU debe ser texto'); const q=importNumber(qty,true),p=Math.round(importNumber(price)*100); if(q<2||p<=0||blank(label))throw new Error('Etiqueta requerida, cantidad >=2 y precio >0'); row.tiers.push({label:String(label).trim(),min_quantity:q,price_cents:p}); }
      catch(error){row.errors.push(`Precios por volumen fila ${i+1}: ${(error as Error).message}`);}
    }
  }
  rows.forEach(r=>{r.tiers.sort((a,b)=>a.min_quantity-b.min_quantity);if(new Set(r.tiers.map(t=>t.min_quantity)).size!==r.tiers.length)r.errors.push('Cantidades de escala duplicadas');});
  if(rows.reduce((total,r)=>total+r.tiers.length,0)>20000)throw new Error('Máximo 20.000 escalas por archivo');
  return rows;
}
export async function readProductFile(file: File): Promise<ImportRow[]> {
  if(file.size>5*1024*1024)throw new Error('Máximo 5 MB por archivo');
  if(file.name.toLowerCase().endsWith('.csv')) {
    const result=Papa.parse<string[]>(await file.text(),{skipEmptyLines:false});
    if(result.errors.length)throw new Error(result.errors[0].message);
    return parseProductRows(result.data);
  }
  if(!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Selecciona un archivo .xlsx o .csv');
  const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true});
  if(!book.Sheets.Productos)throw new Error('Falta la hoja Productos');
  return parseProductRows(readSheet(book.Sheets.Productos,'Productos'),book.Sheets['Precios por volumen']?readSheet(book.Sheets['Precios por volumen'],'Precios por volumen'):[]);
}
export function prepareProductTemplate(bytes: Uint8Array, catalogs: {familia:string;grupo:string;categoria:string}[]) {
  if(!catalogs.length)throw new Error('Configura primero familias, grupos y categorías válidas en este entorno');
  const zip=unzipSync(bytes), xml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sheetPath='xl/worksheets/sheet3.xml';
  const readXml=(path:string)=>strFromU8(zip[path]).replace(/xmlns:x=/g,'xmlns=').replace(/(<\/?)(?:x:)/g,'$1');
  const sheet=readXml(sheetPath);
  const cell=(source:string,ref:string,value:string)=>{
    const style=source.match(new RegExp(`<c r="${ref}"[^>]*? s="(\\d+)"`))?.[1];
    return `<c r="${ref}"${style?` s="${style}"`:''} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const rows=[['Familia','Grupo','Categoria','Origen','','Categorias disponibles'],...catalogs.map(c=>[c.familia,c.grupo,c.categoria,'Catálogo del backend actual','',c.categoria])];
  const data=rows.map((row,i)=>`<row r="${i+1}"${i===0?' ht="42" customHeight="1"':''}>${row.map((v,j)=>cell(sheet,`${String.fromCharCode(65+j)}${i+1}`,v)).join('')}</row>`).join('');
  zip[sheetPath]=strToU8(sheet.replace(/<sheetData[\s\S]*?<\/sheetData>/,`<sheetData>${data}</sheetData>`).replace(/<dimension[^>]*\/>/,`<dimension ref="A1:F${rows.length}"/>`));
  const products=strFromU8(zip['xl/worksheets/sheet1.xml']);
  zip['xl/worksheets/sheet1.xml']=strToU8(products.replace(/Catalogos!\$F\$2:\$F\$\d+/g,`Catalogos!$F$2:$F$${rows.length}`));
  const guide=XLSX.read(bytes,{type:'array'}).Sheets.Guia;
  const guideRows=XLSX.utils.sheet_to_json<string[]>(guide,{header:1});
  const updates: Record<string,string>={Estado:'Plantilla de importación Katsumoto v1. Usar en Inventario > Importar. Revisar siempre antes de confirmar.', 'Catalogos reales':'Catálogos obtenidos del backend donde descargaste este archivo. Al importar se valida de nuevo la combinación completa.',Origen:'Generado desde Katsumoto. Las hojas Productos y Precios por volumen son las únicas importables.'};
  updates.Capacidad='200 filas preparadas por hoja. Puedes ampliar hasta 5.000 productos y 20.000 escalas. Las filas vacías se ignoran.';
  const guideXml=readXml('xl/worksheets/sheet5.xml');
  zip['xl/worksheets/sheet5.xml']=strToU8(guideXml.replace(/<sheetData[\s\S]*?<\/sheetData>/,`<sheetData>${guideRows.map((row,i)=>`<row r="${i+1}" ht="44" customHeight="1">${row.map((value,j)=>cell(guideXml,`${String.fromCharCode(65+j)}${i+1}`,j===1?(updates[row[0]]||value):value)).join('')}</row>`).join('')}</sheetData>`));
  return zipSync(zip);
}
export async function downloadProductTemplate(catalogs: {familia:string;grupo:string;categoria:string}[]) {
  const response=await fetch('/templates/productos-v1.xlsx');
  if(!response.ok)throw new Error('No se pudo descargar la plantilla');
  const data=prepareProductTemplate(new Uint8Array(await response.arrayBuffer()),catalogs);
  const url=URL.createObjectURL(new Blob([data as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='Plantilla_productos_Katsumoto.xlsx';a.click();URL.revokeObjectURL(url);
}
