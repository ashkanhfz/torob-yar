import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankRows} from '../dist/relevance.js';

const phone=['phone','گوشی سامسونگ A55','گوشی موبایل'];
const cover=['cover','قاب گوشی سامسونگ A55','کیف و کاور گوشی'];
test('phone intent prioritizes the phone over a matching cover',()=>assert.equal(rankRows([cover,phone],'گوشی سامسونگ')[0][0],'phone'));
test('explicit cover intent preserves accessory relevance',()=>assert.equal(rankRows([phone,cover],'قاب گوشی سامسونگ')[0][0],'cover'));
test('Arabic kaf and yeh receive the same ranking',()=>assert.equal(rankRows([cover,phone],'گوشي سامسونگ')[0][0],'phone'));
test('shoe intent favors shoes over shoe storage',()=>{const rows=[['rack','جاکفشی کفش','جاکفشی و جالباسی'],['shoe','کفش کتانی','کتانی و کفش اسپرت']];assert.equal(rankRows(rows,'کفش')[0][0],'shoe')});
test('ranking does not mutate the input array',()=>{const rows=[cover,phone],original=rows.slice();rankRows(rows,'گوشی');assert.deepEqual(rows,original)});
test('equal scores preserve the source order',()=>{const rows=[['a','مدل یک','دسته'],['b','مدل دو','دسته']];assert.deepEqual(rankRows(rows,'مدل').map(x=>x[0]),['a','b'])});
