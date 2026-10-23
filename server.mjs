import {loadSearchSnapshot} from './search-index.mjs';
import {createRouting} from './routing.mjs';
import {createInvertedIndex} from './dist/inverted.js';
import {createElasticSearch} from './elastic.mjs';
import {createAdvisor} from './advisor.mjs';
import {createOperations} from './operations.mjs';
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync,gzip} from 'node:zlib';
import {timingSafeEqual} from 'node:crypto';
const root=path.resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const dataCache=new Map(),dataPending=new Map(),shardWaiters=[];let shardReads=0;
async function readData(n){
 const shard=/^p\d+$/.test(n);if(shard){if(shardReads>=3)await new Promise(resolve=>shardWaiters.push(resolve));else shardReads++}
 try{return JSON.parse(gunzipSync(Buffer.from(JSON.parse(await readFile(path.join(root,'data',n+'.json'))).gzip,'base64')))}finally{if(shard){const next=shardWaiters.shift();if(next)next();else shardReads--}}
}
async function data(n){
 if(dataCache.has(n)){const value=dataCache.get(n);if(/^p\d+$/.test(n)){dataCache.delete(n);dataCache.set(n,value)}return value}
 if(dataPending.has(n))return dataPending.get(n);
 const pending=readData(n).then(value=>{dataCache.set(n,value);const shards=[...dataCache.keys()].filter(k=>/^p\d+$/.test(k));for(const old of shards.slice(0,-8))dataCache.delete(old);return value}).finally(()=>dataPending.delete(n));dataPending.set(n,pending);return pending;
}
let index,preparedPostings;
function loadIndex(){return index ||= loadSearchSnapshot(path.join(root,'data')).then(async saved=>{if(saved){preparedPostings=saved.postings;return saved.rows}return (await Promise.all(Array.from({length:8},(_,i)=>data('index'+i)))).flat()}).catch(error=>{index=null;throw error})}
let inverted,indexById;const elasticSearch=createElasticSearch();
function rowMap(){return indexById ||= loadIndex().then(rows=>new Map(rows.map(r=>[r[0],r]))).catch(error=>{indexById=null;throw error})}
async function searchPage(q,budget,options={}){const started=performance.now();const rows=await loadIndex();const byId=await rowMap();let result=await elasticSearch(q,budget,options);if(result){const resolved=result.ids.map(id=>byId.get(id));if(resolved.every(Boolean))result={results:resolved,total:result.total,engine:result.engine};else result=null}if(!result){inverted ||= createInvertedIndex(rows,preparedPostings);result=inverted.search(q,budget,options)}return {...result,took:Math.round(performance.now()-started)}}
async function search(q,budget){return (await searchPage(q,budget)).results}
const productIdPattern=/^product_[a-f0-9]{24}$/;
async function readProducts(ids){
 const byId=await rowMap(),groups=new Map(),found=new Map();
 for(const id of ids){const row=byId.get(id);if(!row)continue;const shard='p'+row[3];if(!groups.has(shard))groups.set(shard,[]);groups.get(shard).push(id)}
 // Bound simultaneous decompression: 24 requests must not retain 24 full shards.
 const batches=[...groups];for(let i=0;i<batches.length;i+=3)await Promise.all(batches.slice(i,i+3).map(async([shard,wanted])=>{const products=await data(shard);for(const id of wanted)if(products[id])found.set(id,products[id])}));
 return {products:ids.filter(id=>found.has(id)).map(id=>found.get(id)),missing:ids.filter(id=>!found.has(id))};
}
function send(res,status,value){
 const serialized=JSON.stringify(value),req=res.req;
 const finish=(buffer,compressed=false)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':Buffer.byteLength(buffer),'Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{})});res.end(buffer)};
 if(serialized.length>1024&&/\bgzip\b/.test(req?.headers['accept-encoding']||''))gzip(serialized,(error,buffer)=>error?finish(serialized):finish(buffer,true));else finish(serialized);
}
async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>16000)throw Error('body_too_large');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString()||'{}')}
const rate=new Map();
function allowed(req){const read=req.method==='GET',limit=read?120:20,k=(read?'read:':'write:')+req.socket.remoteAddress,t=Date.now();let s=rate.get(k);if(!s||t-s.at>60000){rate.set(k,{at:t,n:1});if(rate.size>10000)rate.clear();return true}return ++s.n<=limit}
function authorized(req){const expected=process.env.CALL_ADMIN_TOKEN||'',given=(req.headers.authorization||'').replace(/^Bearer /,'');return expected.length>20&&given.length===expected.length&&timingSafeEqual(Buffer.from(given),Buffer.from(expected))}
const advisor=createAdvisor();
const routeJourney=createRouting();
const operations=createOperations({send,body,usage:()=>advisor.usage(),meta:()=>data('meta'),getIndex:async(refresh=false)=>{if(refresh){dataCache.clear();index=null;inverted=null;indexById=null;preparedPostings=null}return loadIndex()},getProduct:async(id)=>(await readProducts([id])).products[0]||null});
const server=http.createServer(async(req,res)=>{try{let url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/health')return send(res,200,{ok:true,routing:!!process.env.OSRM_BASE_URL,assistant:!!(process.env.AI_API_KEY&&process.env.AI_BASE_URL&&process.env.AI_MODEL),calls:!!(process.env.CALL_ADAPTER_URL&&process.env.CALL_ADMIN_TOKEN),dataset:'v16',syntheticPhones:true});
 if(url.pathname.startsWith('/api/')&&!allowed(req))return send(res,429,{error:'rate_limit'});
 if(await operations.route(req,res,url))return;
 if(url.pathname==='/api/route'&&req.method==='POST'){
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'origin_not_allowed'});
  let input;try{input=await body(req)}catch{return send(res,400,{error:'invalid_route_points'})}
  const result=await routeJourney(input.points);return send(res,result.status,result.body);
 }
 if(url.pathname==='/api/search'&&req.method==='GET')return send(res,200,await searchPage((url.searchParams.get('q')||'').slice(0,200),Number(url.searchParams.get('budget'))||0,{limit:Math.min(160,Math.max(1,Number(url.searchParams.get('limit'))||30)),sort:url.searchParams.get('sort')==='cheap'?'cheap':'relevance'}));
 if(url.pathname==='/api/products'&&req.method==='GET'){
  const ids=(url.searchParams.get('ids')||'').split(',');
  if(!ids.length||ids.length>24||ids.some(id=>!productIdPattern.test(id)))return send(res,400,{error:'invalid_product_ids'});
  return send(res,200,await readProducts([...new Set(ids)]));
 }
 if(url.pathname.startsWith('/api/products/')&&req.method==='GET'){
  const id=url.pathname.slice('/api/products/'.length);if(!productIdPattern.test(id))return send(res,400,{error:'invalid_product_id'});
  const product=(await readProducts([id])).products[0];return send(res,product?200:404,product?{product}:{error:'unknown_product'});
 }
 if(url.pathname==='/api/assistant'&&req.method==='POST'){
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'origin_not_allowed'});
  const b=await body(req);let message=String(b.message||'').slice(0,1200),q=String(b.query||message).slice(0,200);if(!message.trim())return send(res,400,{error:'message_required'});
  let products;
  if(b.productIds!==undefined){
   if(!Array.isArray(b.productIds)||b.productIds.length<2||b.productIds.length>4||new Set(b.productIds).size!==b.productIds.length||b.productIds.some(id=>typeof id!=='string'||!productIdPattern.test(id)))return send(res,400,{error:'invalid_comparison_products'});
   const resolved=await readProducts(b.productIds);if(resolved.missing.length)return send(res,404,{error:'unknown_comparison_product'});products=resolved.products;
  }else{const rows=await search(q,Math.max(0,Number(b.budget)||0));products=(await readProducts(rows.slice(0,4).map(r=>r[0]))).products}

  const fallback={mode:'structured',message:products.length?'این گزینه‌ها بر اساس عبارت جستجو و بودجه پیدا شدند. مشخصات دو مدل را مقایسه کن؛ موجودی باید از فروشگاه استعلام شود.':'برای پیشنهاد دقیق‌تر، دسته یا نام محصول را مشخص کن و بودجه را تغییر بده.',products:products.map(p=>({id:p.id,title:p.title,price:p.min,shard:p.shard}))};
  if(!process.env.AI_API_KEY||!process.env.AI_BASE_URL||!process.env.AI_MODEL)return send(res,200,fallback);
  const answer=await advisor.answer({message,products:products.slice(0,4)});return send(res,200,answer?{...fallback,...answer}: {...fallback,notice:'سقف مصرف یا دسترسی سرویس اجازهٔ پاسخ مدل را نداد؛ راهنمای رایگان نمایش داده شد.'});
 }
 if(url.pathname==='/api/call'&&req.method==='POST'){
  if(!authorized(req))return send(res,401,{error:'admin_authorization_required'});
  if(!process.env.CALL_ADAPTER_URL||!process.env.CALL_ADAPTER_URL.startsWith('https://'))return send(res,503,{error:'call_adapter_not_configured'});
  const b=await body(req);
  // Dataset phone numbers must NEVER be used. Operator must verify a real public shop contact.
  if(b.contactSource!=='operator_verified'||!/^\+98\d{10}$/.test(b.phone||'')||!b.productId||!b.shopId)return send(res,400,{error:'verified_real_contact_required'});
  const row=(await rowMap()).get(b.productId);if(!row)return send(res,404,{error:'unknown_product'});
  const p=(await data('p'+row[3]))[b.productId];if(!p.offers.some(o=>o.shop===b.shopId))return send(res,400,{error:'shop_has_no_offer_for_product'});
  const r=await fetch(process.env.CALL_ADAPTER_URL,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+(process.env.CALL_ADAPTER_TOKEN||'')},body:JSON.stringify({phone:b.phone,shopId:b.shopId,productId:p.id,productTitle:p.title,questions:['قیمت امروز و موجودی مدل دقیق؟','رنگ یا سایز و گارانتی؟','ساعت مراجعه و طبقه و واحد؟','شرایط پرداخت اعتباری حضوری؟'],idempotencyKey:String(b.requestId||'').slice(0,100)})});
  if(!r.ok)return send(res,502,{error:'call_adapter_failed'});let result=await r.json();return send(res,202,{status:'submitted',requestId:result.requestId||null,stockConfirmed:false});
 }
 if(url.pathname.startsWith('/api/'))return send(res,404,{error:'endpoint_not_found'});
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 let decoded=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+decoded);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end()}
 if(decoded.endsWith('/'))file=path.join(file,'index.html');let info;try{info=await stat(file)}catch{res.writeHead(404);return res.end('Not found')}if(!info.isFile()){res.writeHead(404);return res.end()}
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.gz':'application/gzip','.json':'application/json; charset=utf-8'};
 const etag='W/\"'+info.size.toString(16)+'-'+Math.trunc(info.mtimeMs).toString(16)+'\"',headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':file.includes(path.sep+'data'+path.sep)?'public, max-age=3600':'no-cache','ETag':etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};if(req.headers['if-none-match']===etag){res.writeHead(304,headers);return res.end()}res.writeHead(200,{...headers,'Content-Length':info.size});if(req.method==='HEAD')return res.end();const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch(e){send(res,e.message==='body_too_large'?413:e instanceof SyntaxError?400:500,{error:e.message==='body_too_large'?'request_too_large':e instanceof SyntaxError?'invalid_json':'request_failed'})}});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>{console.log(`TorobYar http://localhost:${Number(process.env.PORT)||3000}`);rowMap().catch(()=>console.error('Catalogue warm-up unavailable; the next request will retry'))});
