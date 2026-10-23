import {parseSearchIntent,normalizeSearch} from './dist/search.js';

export function elasticConfig(){
 const url=process.env.ELASTICSEARCH_URL||'',index=process.env.ELASTICSEARCH_INDEX||'torob-products';
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(index))throw Error('invalid_elastic_index');
 if(url){const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('invalid_elastic_url')}
 const key=process.env.ELASTICSEARCH_API_KEY,user=process.env.ELASTICSEARCH_USERNAME,password=process.env.ELASTICSEARCH_PASSWORD;
 if(!key&&!!user!==!!password)throw Error('incomplete_elastic_credentials');
 const authorization=key?'ApiKey '+key:user?'Basic '+Buffer.from(user+':'+password).toString('base64'):null;
 return {url:url.replace(/\/$/,''),index,headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})}};
}
export const elasticMapping={settings:{number_of_shards:1,number_of_replicas:0,analysis:{analyzer:{catalog:{type:'custom',tokenizer:'whitespace',filter:['lowercase']}}}},mappings:{dynamic:'strict',properties:{id:{type:'keyword'},title:{type:'text',analyzer:'catalog'},category:{type:'keyword'},text:{type:'text',analyzer:'catalog',index_prefixes:{min_chars:2,max_chars:12}},price:{type:'long'},shard:{type:'integer'}}}};
export const elasticDocument=r=>({id:r[0],title:normalizeSearch(r[1]),category:r[2],text:normalizeSearch(r[1]+' '+r[2]),price:r[4]>0?r[4]:null,shard:r[3]});

export function elasticQuery(q,budget,{limit=30,offset=0,sort='relevance'}={}){
 const intent=parseSearchIntent(q),ceiling=intent.budget||Number(budget)||0,preferred=[],query=intent.query;
 if(/گوشی|موبایل/.test(query)&&!/قاب|کاور|باتری|گلس|شارژر|فلت|لنز|قطعه|درب|هولدر|محافظ/.test(query))preferred.push({term:{category:'گوشی موبایل'}});
 if(/کفش|کتانی/.test(query)&&!/کاور|جاکفشی|واکس/.test(query))preferred.push({prefix:{category:'کفش'}},{prefix:{category:'کتانی'}});
 if(/لپ/.test(query)&&!/کیف|باتری|شارژر|پایه|رم/.test(query))preferred.push({prefix:{category:'لپ'}});
 const terms=[...new Set(query.split(' ').filter(Boolean))];
 // Prefixes use the index_prefixes field. Every query term must match.
 const must=terms.length?terms.map(term=>({bool:{should:[{term:{text:{value:term,boost:2}}},{prefix:{text:{value:term}}}],minimum_should_match:1}})):[{match_all:{}}];
 return {size:limit,from:offset,track_total_hits:true,_source:['id'],query:{bool:{should:preferred.map(filter=>({constant_score:{filter,boost:100}})),minimum_should_match:0,must,filter:ceiling?[{range:{price:{gt:0,lte:ceiling}}}]:[]}},sort:sort==='cheap'?[{price:{order:'asc',missing:'_last'}},{id:'asc'}]:['_score',{id:'asc'}]};
}

export function createElasticSearch({fetcher=fetch,now=()=>Date.now()}={}){
 let retryAfter=0,lastSuccess=null,state='unverified';const cache=new Map(),pending=new Map();
 const search=async(q,budget,options={})=>{
  let c;try{c=elasticConfig()}catch{state='misconfigured';return null}if(!c.url||now()<retryAfter)return null;
  // Beyond the ES result window the caller switches to the internal index.
  if((options.offset||0)+(options.limit||30)>10000)return null;
  const query=elasticQuery(q,budget,options),key=JSON.stringify([c.url,c.index,query]),cached=cache.get(key);
  if(cached&&cached.until>now())return {...cached.result,cached:true};
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{try{
   const r=await fetcher(c.url+'/'+c.index+'/_search',{method:'POST',headers:c.headers,body:JSON.stringify(query),signal:AbortSignal.timeout(1500)});
   if(!r.ok)throw Error('upstream_failed');const d=await r.json(),hits=d.hits?.hits,total=d.hits?.total?.value??d.hits?.total;
   if(d.timed_out||d._shards?.failed||!Array.isArray(hits)||!Number.isSafeInteger(total)||total<0||hits.some(h=>typeof h?._source?.id!=='string'))throw Error('invalid_upstream');
   const ids=hits.map(h=>h._source.id);if(new Set(ids).size!==ids.length)throw Error('duplicate_upstream_ids');
   const result={ids,total,engine:'elasticsearch'};state='available';lastSuccess=now();retryAfter=0;
   cache.set(key,{until:now()+30000,result});while(cache.size>64)cache.delete(cache.keys().next().value);
   return result;
  }catch{state='cooldown';retryAfter=now()+30000;return null}finally{pending.delete(key)}})();
  pending.set(key,job);return job;
 };
 search.status=()=>({configured:!!process.env.ELASTICSEARCH_URL,state:!process.env.ELASTICSEARCH_URL?'disabled':state,lastSuccess,retryInMs:Math.max(0,retryAfter-now())});
 return search;
}
