import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {buildSearchSnapshot,loadSearchSnapshot} from '../search-index.mjs';
import {createInvertedIndex} from '../dist/inverted.js';

test('prepared index preserves ranking and rejects stale or damaged snapshots',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'torob-index-')),snapshot=path.join(directory,'prepared.v8');
 const rows=[['a','گوشی سامسونگ','گوشی موبایل',0,900],['b','قاب گوشی سامسونگ','کیف و کاور',0,50],['c','کتوني مردانه','کفش',0,100]];
 const envelope=value=>JSON.stringify({gzip:gzipSync(JSON.stringify(value)).toString('base64')});
 try{
  for(let i=0;i<8;i++)await writeFile(path.join(directory,`index${i}.json`),envelope(i===0?rows:[]));
  const built=await buildSearchSnapshot(directory,snapshot);assert.equal(built.documents,3);
  const loaded=await loadSearchSnapshot(directory,snapshot);assert.ok(loaded.postings instanceof Map);
  const fresh=createInvertedIndex(rows),prepared=createInvertedIndex(loaded.rows,loaded.postings);
  for(const query of ['گوشی سامسونگ','قاب','سام','کتونی زیر ۲۰۰ تومان',''])assert.deepEqual(prepared.search(query),fresh.search(query));
  assert.equal(prepared.search('گوشی سامسونگ').cached,true);
  assert.equal(prepared.search('گوشی سامسونگ',0,{sort:'cheap'}).results[0][0],'b');
  await writeFile(path.join(directory,'index0.json'),envelope([...rows,['d','گوشی نوکیا','گوشی موبایل',0,300]]));
  assert.equal(await loadSearchSnapshot(directory,snapshot),null);
  await writeFile(snapshot,'not a snapshot');assert.equal(await loadSearchSnapshot(directory,snapshot),null);
 }finally{await rm(directory,{recursive:true,force:true})}
});
