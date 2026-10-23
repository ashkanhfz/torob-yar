import test from 'node:test';
import assert from 'node:assert/strict';
import {visitIntent,visitProducts,shopOffers} from '../dist/visit-intent.js';
test('explicit mobile charger excludes unrelated cheaper chargers',()=>{
 const intent=visitIntent('شارژر موبایل');assert.equal(intent.query,'شارژر گوشی');
 const products=[{id:'camera',category:'شارژر دوربین'},{id:'phone',category:'شارژر گوشی'},{id:'laptop',category:'شارژر لپ تاپ'}];
 assert.deepEqual(visitProducts(products,intent).map(p=>p.id),['phone']);
 assert.equal(visitProducts(products,visitIntent('شارژر دوربین')).length,3);
});
test('shop grouping preserves product relevance ahead of cheapest unrelated match',()=>{
 const products=[{id:'best',offers:[{shop:'s',price:500},{shop:'s',price:400}]},{id:'other',offers:[{shop:'s',price:10}]}];
 const [result]=shopOffers(products,{s:{name:'shop'}});assert.equal(result.p.id,'best');assert.equal(result.price,400);
});
