import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elasticConfig,elasticDocument,elasticQuery,createElasticSearch} from '../elastic.mjs';
const variables=['ELASTICSEARCH_URL','ELASTICSEARCH_INDEX','ELASTICSEARCH_API_KEY','ELASTICSEARCH_USERNAME','ELASTICSEARCH_PASSWORD'];
async function environment(values,run){const before=Object.fromEntries(variables.map(k=>[k,process.env[k]]));try{for(const k of variables)delete process.env[k];Object.assign(process.env,values);await run()}finally{for(const k of variables){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}}}
const good=()=>({ok:true,json:async()=>({hits:{total:{value:2},hits:[{_source:{id:'a'}},{_source:{id:'b'}}]}})});
test('managed private service supports Basic credentials and API key precedence without URL credentials',async()=>{
 await environment({ELASTICSEARCH_URL:'http://search.internal:9200',ELASTICSEARCH_USERNAME:'reader',ELASTICSEARCH_PASSWORD:'example'},async()=>{
  assert.equal(elasticConfig().headers.Authorization,'Basic '+Buffer.from('reader:example').toString('base64'));
  process.env.ELASTICSEARCH_API_KEY='example-key';assert.equal(elasticConfig().headers.Authorization,'ApiKey example-key');
  process.env.ELASTICSEARCH_URL='http://user:secret@example.test';assert.throws(elasticConfig,/invalid_elastic_url/);
 });
 await environment({ELASTICSEARCH_USERNAME:'reader'},async()=>assert.throws(elasticConfig,/incomplete_elastic_credentials/));
});
test('unknown prices sort last and Persian prefix queries require each normalized term',()=>{
 assert.equal(elasticDocument(['id','مدل','دسته',0,0]).price,null);
 const q=elasticQuery('گوشی سام a۲ زیر ۲۰ میلیون',0,{limit:24,offset:24});
 assert.equal(q.from,24);assert.equal(q.query.bool.must.length,3);assert.equal(q.query.bool.must[2].bool.should[1].prefix.text.value,'a2');
 assert.equal(q.query.bool.filter[0].range.price.lte,20000000);assert.deepEqual(q.sort.at(-1),{id:'asc'});
});
test('identical concurrent and cached searches share one upstream request then expire',async()=>{
 await environment({ELASTICSEARCH_URL:'http://search.internal:9200'},async()=>{
  let calls=0,clock=100;const search=createElasticSearch({now:()=>clock,fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return good()}});
  const results=await Promise.all([search('گوشی',0),search('گوشی',0)]);assert.deepEqual(results[0].ids,['a','b']);assert.equal(calls,1);
  assert.equal((await search('گوشی',0)).cached,true);assert.equal(calls,1);clock+=30001;await search('گوشی',0);assert.equal(calls,2);
  assert.equal(search.status().state,'available');assert.equal(search.status().configured,true);
 });
});
test('malformed responses enter cooldown then recover without exposing upstream errors',async()=>{
 await environment({ELASTICSEARCH_URL:'http://search.internal:9200'},async()=>{
  let clock=100,calls=0;const search=createElasticSearch({now:()=>clock,fetcher:async()=>{calls++;return calls===1?{ok:true,json:async()=>({hits:{total:{value:1},hits:[{_source:{}}]}})}:good()}});
  assert.equal(await search('گوشی',0),null);assert.equal(search.status().state,'cooldown');assert.equal(await search('دیگر',0),null);assert.equal(calls,1);
  clock+=30001;assert.equal((await search('گوشی',0)).engine,'elasticsearch');assert.equal(search.status().retryInMs,0);
  assert.equal(await search('گوشی',0,{offset:9999,limit:24}),null);assert.equal(calls,2);
 });
});

test('a stalled upstream is aborted within the search timeout and subsequent requests use cooldown',async()=>{
 await environment({ELASTICSEARCH_URL:'http://search.internal:9200'},async()=>{
  let aborted=false;const search=createElasticSearch({fetcher:async(_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)},{once:true})})});
  // Keep the test process alive while the timeout signal owns only an unref timer.
  const keeper=setInterval(()=>{},100);try{assert.equal(await search('گوشی',0),null);assert.equal(aborted,true);assert.equal(search.status().state,'cooldown')}finally{clearInterval(keeper)}
 });
});
