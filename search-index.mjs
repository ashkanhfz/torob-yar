import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serialize,deserialize} from 'node:v8';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {buildPostings} from './dist/inverted.js';

// Build once in the image, so a 512 MB instance never has to tokenize the
// complete catalogue before answering its first search. No public file access.
const version=2;
const files=Array.from({length:8},(_,i)=>`index${i}.json`);
export const defaultSnapshot=fileURLToPath(new URL('./.cache/search-index.v8',import.meta.url));
// Image layers truncate mtimes; content hashes survive builds and detect updates.
async function sources(root){return Promise.all(files.map(async name=>{const content=await readFile(path.join(root,name));return [name,content.length,createHash('sha256').update(content).digest('hex')]}))}

export async function loadSearchSnapshot(root,snapshot=defaultSnapshot){
 try{
  const source=await sources(root),packed=await readFile(snapshot);
  const saved=deserialize(packed);
  if(saved.version!==version||JSON.stringify(saved.sources)!==JSON.stringify(source)||!Array.isArray(saved.rows)||!(saved.postings instanceof Map))return null;
  // v8 views otherwise retain the entire decompressed serialization buffer.
  for(const [word,positions]of saved.postings)saved.postings.set(word,Uint32Array.from(positions));
  return {rows:saved.rows,postings:saved.postings};
 }catch{return null}
}

export async function buildSearchSnapshot(root,snapshot=defaultSnapshot){
 const started=performance.now(),source=await sources(root);
 const rows=(await Promise.all(files.map(async name=>JSON.parse(gunzipSync(Buffer.from(JSON.parse(await readFile(path.join(root,name))).gzip,'base64')))))).flat();
 const postings=buildPostings(rows);
 // Docker already compresses layers; avoid gzip CPU work on every cold start.
 const packed=serialize({version,sources:source,rows,postings});
 await mkdir(path.dirname(snapshot),{recursive:true});
 const temporary=snapshot+'.tmp';await writeFile(temporary,packed);await rename(temporary,snapshot);
 return {documents:rows.length,terms:postings.size,bytes:packed.length,took:Math.round(performance.now()-started)};
}

if(process.argv[2]==='--build')console.log(JSON.stringify(await buildSearchSnapshot(fileURLToPath(new URL('./dist/data/',import.meta.url)))));
