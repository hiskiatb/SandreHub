const XLSX = require("xlsx");
const fs = require("fs");
const buf = fs.readFileSync("./_to_delete/DSE_Sumatera_Nov_1_test.xlsx");
const wb = XLSX.read(new Uint8Array(buf), {type:"array", raw:false});
console.log("sheets:", wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(ws, {header:1, defval:"", raw:false});
console.log("total json rows (incl header/blank):", json.length);
let h=0;
for(let i=0;i<Math.min(15,json.length);i++){
  if((json[i]||[]).filter(c=>String(c||"").trim()!=="").length>=3){h=i;break;}
}
console.log("detected header row index:", h, JSON.stringify(json[h]));
const dataRows = json.slice(h+1).filter(r=>Array.isArray(r)&&r.some(c=>String(c||"").trim()!==""));
console.log("data rows after blank-filter:", dataRows.length);
