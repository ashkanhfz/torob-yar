// Read-only checks: no AI request, seller contact or admin mutation.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const expected = process.env.EXPECTED_RELEASE_SHA;
const endpoint = pathname => new URL(pathname, base);
async function json(pathname, timeout = 30000) {
  const response = await fetch(endpoint(pathname), {signal: AbortSignal.timeout(timeout), cache: 'no-store'});
  assert.equal(response.status, 200, `${pathname}: HTTP ${response.status}`);
  return response.json();
}

let lastError;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  try {
    const health = await json('/api/health', 10000);
    assert.equal(health.ok, true);
    assert.equal(health.dataset, 'v16');
    assert.equal(health.syntheticPhones, true);
    if (expected) assert.equal((await json('/release.json', 10000)).sha, expected, 'Waiting for the tested commit');
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    await delay(3000);
  }
}
if (lastError) throw lastError;

const homepage = await fetch(endpoint('/'), {signal: AbortSignal.timeout(15000)});
assert.equal(homepage.status, 200);
assert.match(await homepage.text(), /ترب‌یار/);
const search = await json('/api/search?q=' + encodeURIComponent('کتانی') + '&limit=3');
assert.ok(search.total > 0 && search.results.length > 0, 'The official catalogue must be searchable');
const ids = search.results.map(row => row[0]);
assert.ok(ids.every(id => /^product_[a-f0-9]{24}$/.test(id)));
assert.equal(search.offset, 0);
assert.equal(search.nextOffset, ids.length);
assert.equal(search.hasMore, true);
const next = await json('/api/search?q=' + encodeURIComponent('کتانی') + '&limit=3&offset=3' + (search.engine === 'inverted' ? '&engine=inverted' : ''));
assert.equal(next.offset, 3);
if (next.engine === search.engine) assert.ok(next.results.every(row => !ids.includes(row[0])), 'Pages must not repeat products');
const fallback = await json('/api/search?q=' + encodeURIComponent('کتانی') + '&limit=3&engine=inverted');
assert.equal(fallback.engine, 'inverted');
assert.ok(fallback.results.length > 0, 'Internal index must remain usable');
const details = await json('/api/products?ids=' + ids.join(','));
assert.deepEqual(details.products.map(product => product.id), ids);
assert.equal(details.missing.length, 0);
assert.ok(details.products.every(product => product.title && product.offers.length));
for (const pathname of ['/.env', '/server.mjs']) {
  const response = await fetch(endpoint(pathname), {signal: AbortSignal.timeout(10000)});
  assert.equal(response.status, 404, `Private file exposed: ${pathname}`);
  await response.arrayBuffer();
}
console.log(`PASS: ${base} — health, ${expected ? 'release, ' : ''}homepage, catalogue, pagination, internal index and private-file checks.`);
