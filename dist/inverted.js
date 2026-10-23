import {normalizeSearch,parseSearchIntent} from './search.js';
import {rankRows} from './relevance.js';
// Token -> sorted document ordinals. Substring expansion preserves existing Persian search behavior.
export function createInvertedIndex(rows){
 const postings=new Map(),cached=new Map();
 rows.forEach((r,i)=>{for(const word of new Set(normalizeSearch(r[1]+' '+r[2]).split(' ').filter(Boolean))){if(!postings.has(word))postings.set(word,[]);postings.get(word).push(i)}});
 for(const [word,ids]of postings)postings.set(word,Uint32Array.from(ids));
 function termMatches(term){if(cached.has(term))return cached.get(term);const ids=new Set();for(const [word,positions]of postings)if(word.includes(term))for(const id of positions)ids.add(id);cached.set(term,ids);if(cached.size>24)cached.delete(cached.keys().next().value);return ids}
 function search(text,budget=0,{limit=30,sort='relevance'}={}){const intent=parseSearchIntent(text),ceiling=intent.budget||Number(budget)||0,terms=[...new Set(intent.query.split(' ').filter(Boolean))];const lists=terms.map(termMatches).sort((a,b)=>a.size-b.size);let found=lists.length?[...lists[0]].filter(id=>lists.every(ids=>ids.has(id))).sort((a,b)=>a-b).map(id=>rows[id]):rows.slice();if(ceiling)found=found.filter(r=>r[4]>0&&r[4]<=ceiling);const total=found.length;found=sort==='cheap'?found.sort((a,b)=>(a[4]||Infinity)-(b[4]||Infinity)):rankRows(found,intent.query);return {results:found.slice(0,limit),total,engine:'inverted'}}
 return {search,stats:{documents:rows.length,terms:postings.size,postings:[...postings.values()].reduce((n,v)=>n+v.length,0)}};
}
