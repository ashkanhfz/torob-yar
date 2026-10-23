import {test} from 'node:test';import assert from 'node:assert/strict';import {createInvertedIndex} from '../dist/inverted.js';import {matchesQuery,parseSearchIntent} from '../dist/search.js';import {rankRows} from '../dist/relevance.js';import {elasticQuery,createElasticSearch} from '../elastic.mjs';
const rows=[['a','گوشی سامسونگ A۵۵','گوشی موبایل',0,900],['b','قاب گوشی سامسونگ','کیف و کاور',0,50],['c','کتوني مردانه','کفش',0,100],['d','کتانی زنانه','کفش',0,0],['e','گوشی آیفون','گوشی موبایل',0,1200]];
test('inverted intersection preserves Persian normalization, substring, category, budgets and ranking',()=>{const index=createInvertedIndex(rows);for(const q of ['گوشی سامسونگ','سام','كفش','کتونی زیر ۲۰۰ تومان','a55','iphone','ناموجود','']){const intent=parseSearchIntent(q);let expected=rows.filter(r=>matchesQuery(r,intent.query)&&(!intent.budget||r[4]>0&&r[4]<=intent.budget));expected=rankRows(expected,intent.query);assert.deepEqual(index.search(q).results,expected,q)}assert.equal(index.search('گوشی',100).results[0][0],'b');assert.equal(index.search('گوشی',0,{sort:'cheap'}).results[0][0],'b')});
test('Elasticsearch request uses AND and budget filters; outage opens cooldown',async()=>{const query=elasticQuery('گوشی زیر ۲ میلیون',0);assert.equal(query.query.bool.must[0].bool.minimum_should_match,1);assert.equal(query.query.bool.must[0].bool.should[1].prefix.text.value,'گوشی');assert.equal(query.query.bool.filter[0].range.price.lte,2000000);process.env.ELASTICSEARCH_URL='https://example.test';let calls=0;const search=createElasticSearch({fetcher:async()=>{calls++;throw Error('offline')}});assert.equal(await search('گوشی',0),null);assert.equal(await search('گوشی',0),null);assert.equal(calls,1);delete process.env.ELASTICSEARCH_URL});

 test('Elasticsearch boosts the requested device category without overriding accessory intent',async()=>{
  const {elasticQuery}=await import('../elastic.mjs');
  const phone=elasticQuery('گوشی سامسونگ',0);
  assert.equal(phone.query.bool.should[0].constant_score.filter.term.category,'گوشی موبایل');
  assert.equal(elasticQuery('باتری گوشی سامسونگ',0).query.bool.should.length,0);
  assert.equal(elasticQuery('قاب گوشی سامسونگ',0).query.bool.should.length,0);
 });

 test('both engines paginate without changing page size or treating unknown price as cheapest',()=>{
 const index=createInvertedIndex(rows),whole=index.search('',0,{limit:10}).results;
 assert.deepEqual([...index.search('',0,{limit:2}).results,...index.search('',0,{limit:3,offset:2}).results],whole);
 assert.equal(index.search('',0,{sort:'cheap'}).results.at(-1)[0],'d');
 const q=elasticQuery('سام a2',0,{limit:24,offset:48,sort:'cheap'});
 assert.equal(q.from,48);assert.equal(q.size,24);assert.equal(q.query.bool.must.length,2);assert.equal(q.sort[0].price.missing,'_last');assert.deepEqual(q.sort.at(-1),{id:'asc'});
 });
