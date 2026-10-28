'use strict';
// 文字解析只是建议填入，关键字段须人工核对。
const PROVINCES=['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','内蒙古','广西','西藏','宁夏','新疆','香港','澳门','台湾'];
const ALIASES={'内蒙':'内蒙古','广西壮族':'广西','宁夏回族':'宁夏','新疆维吾尔':'新疆','西藏自治区':'西藏','内蒙古自治区':'内蒙古'};
function cleanText(s){return String(s||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[：﹕]/g,':').replace(/（/g,'(').replace(/）/g,')')}
function provinceAt(s){for(let i=0;i<s.length;i++){const starts=PROVINCES.filter(x=>s.startsWith(x,i)).sort((a,b)=>b.length-a.length);if(starts.length)return starts[0];for(const [alias,p] of Object.entries(ALIASES))if(s.startsWith(alias,i))return p;}return ''}
function extract(lines){
 const arr=(Array.isArray(lines)?lines:String(lines||'').split(/\r?\n/)).map(x=>cleanText(typeof x==='string'?x:x?.DetectedText||x?.text||'').trim()).filter(Boolean);
 const all=arr.join('\n');const flat=all.replace(/[\r\n]+/g,' ');
 const fields={};
 const label=/(?:收件方|收货人|收件人|收方|收货地址|收件地址|收件信息)/g;let match,marker=-1;
 while((match=label.exec(all)))marker=match.index;
 const recipientBlock=marker>=0?all.slice(marker):'';
 const addressBlock=recipientBlock.split(/(?:寄件方|寄件人|寄方|寄件地址)/)[0];
 fields.province=provinceAt(addressBlock)||provinceAt(all);
 const strip=v=>v.replace(/[\s\-–—]/g,'').toUpperCase();
 const patterns=[/(?:运单号|快递单号|物流单号|单号|单据号)\s*[:：]?\s*(SF[\s\-]*[0-9][0-9\s\-]{10,20}|[0-9][0-9\s\-]{10,20})/gi,/(?:^|[^A-Z0-9])(SF\s*(?:[0-9][\s\-]*){11,15})/gim];
 for(let k=0;k<patterns.length&&!fields.tracking;k++){
   const source=k===0?flat:all;let m;
   while((m=patterns[k].exec(source))){const id=strip(m[1]);const digits=id.replace(/\D/g,'');if(digits.length>=11&&digits.length<=18){fields.tracking=id;break}}
 }
 const weightPatterns=[/(?:计费\s*重量|计费重|收费重量|计重|收费重)\s*[:：]?\s*([0-9]{1,5}(?:[.,][0-9]{1,3})?)\s*(?:k\s*g|公斤|千克)?/i,/(?:重量|实重|寄件重量)\s*[:：]?\s*([0-9]{1,5}(?:[.,][0-9]{1,3})?)\s*(?:k\s*g|公斤|千克)/i];
 for(const re of weightPatterns){const m=flat.match(re);if(m){const v=Number(m[1].replace(',','.'));if(Number.isFinite(v)&&v>=20&&v<=100000){fields.rawWeight=String(v);break}}}
 if(!fields.rawWeight){const candidates=[...all.matchAll(/(?:^|\s)([0-9]{2,5}(?:\.[0-9]{1,3})?)\s*(?:k\s*g|千克|公斤)\b/gim)].map(x=>Number(x[1]));if(candidates.length===1&&candidates[0]>=20&&candidates[0]<=100000)fields.rawWeight=String(candidates[0])}
 if(recipientBlock){
   let name=recipientBlock.match(/(?:收件方|收货人|收件人|收方)\s*[:：]?\s*([\u4e00-\u9fa5·]{2,5})(?:\s|\d|$|,)/m);
   if(!name){const after=recipientBlock.split(/\n/).slice(1,3).join(' ');name=after.match(/^\s*([\u4e00-\u9fa5·]{2,4})(?=\s|1\d{10}|$)/)}
   if(name&&!/(地址|电话|手机|客户|收件|收货|寄件|湖南|山东|广东|北京市|自治区)/.test(name[1]))fields.receiver=name[1];
 }
 Object.keys(fields).forEach(k=>{if(!fields[k])delete fields[k]});
 return fields;
}
module.exports={extract,PROVINCES};
