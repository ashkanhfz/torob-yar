import {normalizeSearch} from './search.js';
// An explicit phone-charger request must not turn into a cheaper camera charger.
export function visitIntent(value){
 const text=normalizeSearch(value);
 const phoneCharger=/شارژر/.test(text)&&/گوشی|موبایل/.test(text)&&!/دوربین|گوپرو|لپ تاپ|فندکی|ساعت/.test(text);
 return {query:phoneCharger?text.replace(/موبایل/g,'گوشی'):text,phoneCharger};
}
export function visitProducts(products,intent){
 return products.filter(p=>p&&(!intent.phoneCharger||normalizeSearch(p.category)==='شارژر گوشی'));
}
export function shopOffers(products,shops){
 const unique=new Map();
 // Search relevance takes precedence; compare prices only within the same product.
 for(const p of products)for(const o of p.offers||[]){
  if(!shops[o.shop])continue;
  const old=unique.get(o.shop);
  if(!old||(old.p.id===p.id&&(o.price||Infinity)<(old.price||Infinity)))unique.set(o.shop,{...o,id:o.shop,s:shops[o.shop],p});
 }
 return [...unique.values()];
}
