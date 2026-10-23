// Explicit administrative import. Never called by a visitor or during server startup.
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {randomBytes} from 'node:crypto';
import {elasticConfig,elasticMapping,elasticDocument} from '../elastic.mjs';
const c=elasticConfig();if(!c.url)throw Error('Set ELASTICSEARCH_URL and credentials on this machine.');
const index=c.index+'-'+Date.now()+'-'+randomBytes(3).toString('hex');
async function request(route,method,body,ndjson=false){const r=await fetch(c.url+route,{method,headers:{...c.headers,...(ndjson?{'Content-Type':'application/x-ndjson'}:{})},body:body===undefined?undefined:ndjson?body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Elasticsearch returned HTTP '+r.status);return r.json()}
await request('/'+index,'PUT',{...elasticMapping,settings:{...elasticMapping.settings,refresh_interval:'-1'}});let count=0;
for(let n=0;n<8;n++){const envelope=JSON.parse(await readFile(new URL('../dist/data/index'+n+'.json',import.meta.url),'utf8'));const rows=JSON.parse(gunzipSync(Buffer.from(envelope.gzip,'base64')));for(let i=0;i<rows.length;i+=500){const batch=rows.slice(i,i+500),body=batch.flatMap(r=>[JSON.stringify({index:{_index:index,_id:r[0]}}),JSON.stringify(elasticDocument(r))]).join('\n')+'\n';const result=await request('/_bulk','POST',body,true);if(result.errors)throw Error('Bulk import failed; existing alias was left unchanged.');count+=batch.length}console.log('Indexed '+count+' products')}
await request('/'+index+'/_settings','PUT',{index:{refresh_interval:'1s'}});
await request('/'+index+'/_refresh','POST');const result=await request('/'+index+'/_count','GET');if(result.count!==count)throw Error('Document count mismatch; alias unchanged');
let previous={};const old=await fetch(c.url+'/_alias/'+c.index,{headers:c.headers,signal:AbortSignal.timeout(10000)});if(old.ok)previous=await old.json();else if(old.status!==404)throw Error('Cannot read existing alias');
await request('/_aliases','POST',{actions:[...Object.keys(previous).map(name=>({remove:{index:name,alias:c.index}})),{add:{index,alias:c.index}}]});console.log('Alias switched atomically to '+index+'. Old indices retained for rollback.');
