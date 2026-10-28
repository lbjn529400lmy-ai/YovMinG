'use strict';
// Vercel Node.js Function, no third-party dependencies. Images are streamed to Tencent OCR,
// NOT stored in Supabase or a filesystem; logs deliberately omit raw images, text and tokens.
const {createHash,createHmac}=require('node:crypto');
const {extract}=require('../lib/parse-label.cjs');
const HOST='ocr.tencentcloudapi.com';
const MAX_BASE64=3_000_000; // leave headroom for Vercel Function 4.5MB request body limit
const hash=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,msg,format)=>createHmac('sha256',key).update(msg).digest(format);
function authorization(secretId,secretKey,payload,timestamp){
 const day=new Date(timestamp*1000).toISOString().slice(0,10);
 const canonical=`POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${HOST}\nx-tc-action:generalaccurateocr\n\ncontent-type;host;x-tc-action\n${hash(payload)}`;
 const signText=`TC3-HMAC-SHA256\n${timestamp}\n${day}/ocr/tc3_request\n${hash(canonical)}`;
 const key=hmac(hmac(hmac('TC3'+secretKey,day),'ocr'),'tc3_request');
 return `TC3-HMAC-SHA256 Credential=${secretId}/${day}/ocr/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${hmac(key,signText,'hex')}`;
}
function reply(res,status,obj){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, no-cache, private, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(obj)}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'只支持 POST 请求'});
 // Avoid cross-site requests to an authenticated API. Requests are same-origin; no CORS enabled.
 const origin=req.headers.origin;const host=req.headers['x-forwarded-host']||req.headers.host;
 if(origin){let o;try{o=new URL(origin)}catch(_){return reply(res,403,{error:'来源不正确'})}if(o.host!==host)return reply(res,403,{error:'不允许跨站调用识别接口'})}
 const url=process.env.SUPABASE_URL;const pub=process.env.SUPABASE_PUBLISHABLE_KEY;
 const secretId=process.env.TENCENT_SECRET_ID;const secretKey=process.env.TENCENT_SECRET_KEY;
 if(!url||!pub||!secretId||!secretKey)return reply(res,503,{error:'云端 OCR 尚未配置。请在服务器设置 Supabase 和腾讯云 OCR 环境变量。'});
 const bearer=(req.headers.authorization||'').match(/^Bearer\s+(\S+)$/i);
 if(!bearer)return reply(res,401,{error:'请先登录工作台后再识别'});
 try{
  // Validate access token with the project's Auth server, NOT just decode JWT claims.
  const auth=await fetch(url.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:pub,Authorization:'Bearer '+bearer[1]},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!auth.ok)return reply(res,401,{error:'登录已过期，请重新登录'});
  const user=await auth.json();if(!user?.id)return reply(res,401,{error:'账号验证失败'});
  const b=req.body&&typeof req.body==='object'?req.body:{};
  const imageBase64=String(b.imageBase64||'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)||imageBase64.length<1000||imageBase64.length>MAX_BASE64)return reply(res,400,{error:'图片数据无效或太大，请重新选择 JPG/PNG 图片并压缩后识别。'});
  const bytes=Buffer.from(imageBase64,'base64');
  // JPEG or PNG only; reject arbitrary file content.
  const jpeg=bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  if(!jpeg&&!png)return reply(res,415,{error:'只接受 JPG 或 PNG 图片'});
  const payload=JSON.stringify({ImageBase64:imageBase64,EnableDetectSplit:true});
  const timestamp=Math.floor(Date.now()/1000);
  const headers={Host:HOST,'Content-Type':'application/json; charset=utf-8',Authorization:authorization(secretId,secretKey,payload,timestamp),'X-TC-Action':'GeneralAccurateOCR','X-TC-Version':'2018-11-19','X-TC-Timestamp':String(timestamp),'X-TC-Region':process.env.TENCENT_REGION||'ap-guangzhou'};
  const r=await fetch('https://'+HOST,{method:'POST',headers,body:payload,signal:AbortSignal.timeout(22000),cache:'no-store'});
  const response=await r.json();if(!r.ok||response.Response?.Error){const err=response.Response?.Error;return reply(res,502,{error:err?'识别服务返回错误：'+err.Code+'，请检查服务开通与额度。':'OCR 上游响应异常'});}
  const rows=Array.isArray(response.Response?.TextDetections)?response.Response.TextDetections:[];
  const lines=rows.map(t=>String(t.DetectedText||'').trim()).filter(Boolean);
  return reply(res,200,{provider:'腾讯云高精度通用文字识别',lines,rawText:lines.join('\n'),fields:extract(lines),requestId:response.Response?.RequestId||null});
 }catch(e){const timeout=e.name==='TimeoutError'||e.name==='AbortError';return reply(res,502,{error:timeout?'云端识别超时，请稍后重试':'OCR 请求失败，请检查网络、云端设置和账户权限。'});}
};
module.exports._signForTest=authorization;
