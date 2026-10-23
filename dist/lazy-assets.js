/** Optional assets are requested only by the feature that needs them. Failed loads can retry. */
const styles=new Map(),scripts=new Map();
function asset(url,kind,cache){
 if(!cache.has(url)){
  const promise=new Promise((resolve,reject)=>{
   const el=document.createElement(kind==='style'?'link':'script');
   if(kind==='style'){el.rel='stylesheet';el.href=url}else{el.src=url;el.async=true}
   const timer=setTimeout(()=>fail(),20000);
   const fail=()=>{clearTimeout(timer);el.remove();cache.delete(url);reject(new Error('asset_unavailable'))};
   el.onload=()=>{clearTimeout(timer);resolve()};el.onerror=fail;document.head.append(el);
  });cache.set(url,promise);
 }return cache.get(url);
}
export const loadStyle=url=>asset(url,'style',styles);
export async function loadLeaflet(){await Promise.all([loadStyle('vendor/leaflet/leaflet.css'),globalThis.L?Promise.resolve():asset('vendor/leaflet/leaflet.js','script',scripts)]);if(!globalThis.L)throw new Error('map_unavailable');return globalThis.L}
