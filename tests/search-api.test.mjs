import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
let child,upstream,calls=0;const base='http://127.0.0.1:18791';
const ids=['product_47796232454501a5e8179e26','product_330e9dfeb1e5bb04ba3baed6'];
before(async()=>{
 upstream=http.createServer(async(req,res)=>{
  calls++;assert.equal(req.headers.authorization,'Basic '+Buffer.from('test-reader:test-password').toString('base64'));
  let raw='';for await(const part of req)raw+=part;const query=JSON.parse(raw);
  const invalid=JSON.stringify(query).includes('unknownindex');
  const found=invalid?['product_000000000000000000000000']:ids.slice(query.from,query.from+query.size);
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({hits:{total:{value:invalid?1:ids.length},hits:found.map(id=>({_source:{id}}))}}));
 });await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18791',AI_API_KEY:'',CALL_ADMIN_TOKEN:'',ELASTICSEARCH_URL:'http://127.0.0.1:'+upstream.address().port,ELASTICSEARCH_API_KEY:'',ELASTICSEARCH_USERNAME:'test-reader',ELASTICSEARCH_PASSWORD:'test-password'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exited '+code)))})
});
after(()=>{child?.kill();upstream?.closeAllConnections();upstream?.close()});
test('configured Elasticsearch pages hydrate real catalogue rows and report boundaries',async()=>{
 const first=await (await fetch(base+'/api/search?q=گوشی&limit=1')).json();
 const second=await (await fetch(base+'/api/search?q=گوشی&limit=1&offset=1')).json();
 assert.equal(first.engine,'elasticsearch');assert.equal(first.nextOffset,1);assert.equal(first.hasMore,true);assert.equal(second.nextOffset,null);
 assert.deepEqual([first.results[0][0],second.results[0][0]],ids);
});
test('internal inverted index remains directly usable while Elasticsearch is healthy',async()=>{
 const before=calls,result=await (await fetch(base+'/api/search?q=گوشی&limit=24&engine=inverted')).json();
 assert.equal(result.engine,'inverted');assert.equal(result.results.length,24);assert.equal(calls,before);
});
test('foreign catalogue identities trigger internal fallback instead of leaking stale results',async()=>{
 const result=await (await fetch(base+'/api/search?q=unknownindex')).json();
 assert.equal(result.engine,'inverted');assert.equal(result.results.length,0);assert.equal(result.hasMore,false);
});
