import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSearchIntent, parseAmount, matchesQuery, normalizeSearch} from '../dist/search.js';
test('Persian and Arabic digits, separators and decimal amounts',()=>{
 assert.equal(parseAmount('۲۵٬۰۰۰٬۰۰۰'),25000000);assert.equal(parseAmount('١٥٠٠'),1500);
 assert.equal(parseAmount('۱٫۵'),1.5);assert.equal(parseAmount('-100'),0);assert.equal(parseAmount('Infinity'),0);
});
test('natural-language budgets preserve product model numbers',()=>{
 assert.deepEqual(parseSearchIntent('گوشی سامسونگ A۵۵ تا ۲۰ میلیون تومان'),{query:'گوشی سامسونگ a55',budget:20000000});
 assert.deepEqual(parseSearchIntent('کتونی زیر ۱٫۵ میلیون'),{query:'کتانی',budget:1500000});
 assert.deepEqual(parseSearchIntent('گوشی A55'),{query:'گوشی a55',budget:null});
});
test('normalization matches spelling variants without changing model numbers',()=>{
 assert.equal(normalizeSearch('لپ‌تاپ'),normalizeSearch('لپ تاپ'));
 assert.ok(matchesQuery(['p','گوشی موبایل آیفون ۱۳','گوشی'],'iphone 13'));
 assert.ok(matchesQuery(['p','کفش کتانی','کتانی'],'كتوني'));
 assert.ok(!matchesQuery(['p','گوشی A55','موبایل'],'A56'));
});
