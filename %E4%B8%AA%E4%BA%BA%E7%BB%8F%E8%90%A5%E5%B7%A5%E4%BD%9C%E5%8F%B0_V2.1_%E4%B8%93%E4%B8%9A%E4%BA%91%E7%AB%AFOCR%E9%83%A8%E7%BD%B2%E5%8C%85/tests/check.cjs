'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {extract}=require('../lib/parse-label.cjs');
const handler=require('../api/ocr.js');
const sample=['顺丰速运 SF EXPRESS','寄件方 刘某','山东省威海市荣成市','单号 SF 146 145 653 9772','收件方: 陈志良 19158284835','湖南省株洲市攸县','计费重量 235.000kg'];
assert.deepEqual(extract(sample),{province:'湖南',tracking:'SF1461456539772',rawWeight:'235',receiver:'陈志良'});
assert.equal(extract(['收件方: 王某','内蒙古自治区呼和浩特市','计费重量 83.5kg']).province,'内蒙古');
assert.equal(extract(['重量为未知','山东省','235.000元']).rawWeight,undefined);
function res(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.data=v;return this}}}
const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(1000,0)]).toString('base64');
(async()=>{
 let r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.statusCode,405);
 process.env.SUPABASE_URL='https://fake.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';process.env.TENCENT_SECRET_ID='AKID_TEST';process.env.TENCENT_SECRET_KEY='very_secret';
 r=res();await handler({method:'POST',headers:{host:'site.test'},body:{imageBase64:jpeg}},r);assert.equal(r.statusCode,401);
 const previous=global.fetch;let calls=[];
 global.fetch=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'uid-1'})};if(url==='https://ocr.tencentcloudapi.com')return {ok:true,json:async()=>({Response:{TextDetections:sample.map(t=>({DetectedText:t})),RequestId:'test'}})};throw Error('bad URL')};
 r=res();await handler({method:'POST',headers:{host:'site.test',origin:'https://site.test',authorization:'Bearer test-token'},body:{imageBase64:jpeg}},r);
 assert.equal(r.statusCode,200,JSON.stringify(r.data));assert.equal(r.data.fields.province,'湖南');assert.equal(r.data.fields.rawWeight,'235');
 assert.equal(calls.length,2);assert.equal(calls[0].opts.headers.Authorization,'Bearer test-token');
 const ocr=calls[1].opts;assert.match(ocr.headers.Authorization,/TC3-HMAC-SHA256/);assert.equal(ocr.headers['X-TC-Action'],'GeneralAccurateOCR');assert.equal(JSON.parse(ocr.body).ImageBase64,jpeg);
 assert.equal(r.headers['Cache-Control'].includes('no-store'),true);
 r=res();await handler({method:'POST',headers:{host:'site.test',origin:'https://evil.test',authorization:'Bearer token'},body:{imageBase64:jpeg}},r);assert.equal(r.statusCode,403);
 global.fetch=previous;
 console.log('通过：字段解析、自治区、无臆测重量、方法拒绝、登录校验、来源校验、云端 OCR 调用流程（模拟服务）');
})().catch(e=>{console.error(e);process.exit(1)});
