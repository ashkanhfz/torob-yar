import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {rankRows} from '../dist/relevance.js';
let child;const base='http://127.0.0.1:18789';
before(async()=>{child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18789',AI_API_KEY:'',CALL_ADMIN_TOKEN:''},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exited '+code)))})});
after(()=>child?.kill());
test('health explicitly reports unavailable external capabilities',async()=>{const r=await fetch(base+'/api/health');let j=await r.json();assert.equal(j.ok,true);assert.equal(j.assistant,false);assert.equal(j.syntheticPhones,true)});
test('real dataset search returns linked product identities',async()=>{let r=await fetch(base+'/api/search?q='+encodeURIComponent('کتانی'));let j=await r.json();assert.ok(j.results.length>0);assert.equal(j.engine,'inverted');assert.ok(j.total>=j.results.length);assert.ok(j.results.every(x=>x[0].startsWith('product_')))});
test('budget excludes unknown and excessive prices',async()=>{let r=await fetch(base+'/api/search?q='+encodeURIComponent('کفش')+'&budget=1000000');let j=await r.json();assert.ok(j.results.every(x=>x[4]>0&&x[4]<=1000000))});
test('assistant falls back honestly without credentials',async()=>{let r=await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'برای روزمره چه مدلی بخرم؟',query:'کتانی',budget:5000000})});let j=await r.json();assert.equal(j.mode,'structured');assert.ok(j.products.length>0);assert.ok(j.message.includes('استعلام'))});
test('calls cannot be triggered by an unauthenticated visitor',async()=>{let r=await fetch(base+'/api/call',{method:'POST',body:'{}'});assert.equal(r.status,401)});
test('malformed request bodies return 400',async()=>{let r=await fetch(base+'/api/assistant',{method:'POST',body:'{oops'});assert.equal(r.status,400)});
test('secrets and source are not served by the static server',async()=>{let r=await fetch(base+'/.env');assert.equal(r.status,404);r=await fetch(base+'/server.mjs');assert.equal(r.status,404)});
test('homepage and compressed data envelope are served',async()=>{let r=await fetch(base+'/');assert.equal(r.status,200);assert.ok((await r.text()).includes('ترب‌یار'));r=await fetch(base+'/data/meta.json');assert.equal(r.status,200);assert.ok((await r.json()).gzip.length>100)});
test('phone intent ranks phones before matching accessories',()=>{const rows=[['case','قاب گوشی سامسونگ','کیف و کاور گوشی'],['phone','گوشی موبایل سامسونگ A55','گوشی موبایل']];assert.equal(rankRows(rows,'گوشی سامسونگ')[0][0],'phone');assert.equal(rankRows(rows,'قاب گوشی سامسونگ')[0][0],'case')});
const products=['product_47796232454501a5e8179e26','product_330e9dfeb1e5bb04ba3baed6'];
test('bounded product batches retain identity, order and full specifications without whole shards',async()=>{
 const response=await fetch(base+'/api/products?ids='+[...products,products[0],'product_000000000000000000000000'].join(','));
 assert.equal(response.status,200);assert.equal(response.headers.get('content-encoding'),'gzip');
 const result=await response.json();assert.deepEqual(result.products.map(p=>p.id),products);assert.deepEqual(result.missing,['product_000000000000000000000000']);
 assert.ok(result.products.every(p=>p.title&&p.offers.length&&Array.isArray(p.specs)&&Number.isInteger(p.shard)));
 const one=await (await fetch(base+'/api/products/'+products[0])).json();assert.deepEqual(one.product,result.products[0]);
});
test('product endpoints reject malformed and unbounded requests',async()=>{
 for(const ids of ['../../server.mjs',Array(25).fill(products[0]).join(',')])assert.equal((await fetch(base+'/api/products?ids='+encodeURIComponent(ids))).status,400);
});
test('comparison uses selected real products and rejects unknown identities',async()=>{
 const request=productIds=>fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'این دو مدل را مقایسه کن',productIds})});
 const answer=await (await request(products)).json();assert.equal(answer.mode,'structured');assert.deepEqual(answer.products.map(p=>p.id),products);
 assert.equal((await request([products[0],products[0]])).status,400);
 assert.equal((await request([products[0],'product_000000000000000000000000'])).status,404);
});
test('static assets revalidate without downloading unchanged content',async()=>{
 const response=await fetch(base+'/app.js'),etag=response.headers.get('etag');assert.ok(etag);await response.arrayBuffer();
 const unchanged=await fetch(base+'/app.js',{headers:{'If-None-Match':etag}});assert.equal(unchanged.status,304);assert.equal((await unchanged.text()).length,0);
});
test('reading product batches has a separate allowance from paid and mutating routes',async()=>{
 for(let i=0;i<24;i++)assert.equal((await fetch(base+'/api/products?ids=bad')).status,400);
 const response=await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'مقایسه',productIds:products})});assert.equal(response.status,200);
});
