"""Verify full field parity against the official local CSVs, not just row counts."""
import base64
import csv
import gzip
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

csv.field_size_limit(10_000_000)
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data'
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.data/csv'
SOURCE_COLUMNS = {
    'products': {'brand_name', 'category_name', 'image_urls', 'model', 'persian_title', 'product_id', 'specs'},
    'offers': {'description', 'last_price_changed_at', 'offer_id', 'price_toman', 'product_id', 'seller_title', 'shop_id', 'warranty'},
    'shops': {'address', 'category_names', 'contacts', 'instagram', 'lat', 'location_label', 'lon', 'name', 'payment_options', 'shop_id', 'supports_fast_delivery', 'website_url', 'weekly_hours'},
}


def read(name):
    envelope = json.loads((DATA / (name + '.json')).read_text(encoding='utf-8'))
    return json.loads(gzip.decompress(base64.b64decode(envelope['gzip'])))


def rows(name):
    with (SOURCE / (name + '.csv')).open(encoding='utf-8-sig', newline='') as handle:
        yield from csv.DictReader(handle)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).digest()


def text(value):
    return None if value in ('', 'null') else value


def file_hash(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def missing(value):
    return value is None or value == '' or value == [] or value == {}


meta, shops, featured = read('meta'), read('shops'), read('featured')
assert meta['dataSchema'] == 2
assert meta['phonesSynthetic'] is True and meta['contactsSynthetic'] is True
for name in ('products', 'offers', 'shops'):
    file = SOURCE / (name + '.csv')
    assert file.is_file(), 'Raw CSV required for complete-field verification: ' + name
    with file.open(encoding='utf-8-sig', newline='') as handle:
        columns = next(csv.reader(handle))
    assert set(columns) == SOURCE_COLUMNS[name] and len(columns) == len(SOURCE_COLUMNS[name]), 'Unmapped source column: ' + name
    assert meta['sourceFiles'][name] == {'sha256': file_hash(file), 'bytes': file.stat().st_size, 'columns': columns}, 'Raw source identity mismatch: ' + name

expected_shops = set()
shop_missing, hour_status = Counter(), Counter()
shop_metrics = Counter()
for row in rows('shops'):
    sid = row['shop_id']
    assert sid not in expected_shops, 'Duplicate raw shop ID'
    expected_shops.add(sid)
    expected = {key: text(value) for key, value in row.items()}
    for key in ('category_names', 'contacts', 'weekly_hours', 'payment_options', 'supports_fast_delivery'):
        expected[key] = json.loads(row[key])
    for key in ('lat', 'lon'):
        expected[key] = float(row[key]) if text(row[key]) is not None else None
    expected['contactsSynthetic'] = True
    assert shops.get(sid) == expected, 'Shop source field mismatch: ' + sid
    for key, value in expected.items():
        if key != 'contactsSynthetic' and missing(value):
            shop_missing[key] += 1
    for day in (expected['weekly_hours'] or {}).values():
        hour_status[day.get('status', 'unknown')] += 1
    shop_metrics['fastDeliveryTrue'] += expected['supports_fast_delivery'] is True
    shop_metrics['fastDeliveryFalse'] += expected['supports_fast_delivery'] is False
    shop_metrics['hasPublicWebsite'] += bool(expected['website_url'])
    shop_metrics['hasInstagram'] += bool(expected['instagram'])
assert set(shops) == expected_shops
assert meta['coverage']['shops'] == {'total': len(shops), 'missing': dict(shop_missing), 'contactsSynthetic': len(shops), 'weeklyHoursDayStatus': dict(hour_status), **shop_metrics}

expected_offers, minimum_prices = {}, {}
offer_missing = Counter()
for row in rows('offers'):
    oid, pid = row['offer_id'], row['product_id']
    assert oid not in expected_offers, 'Duplicate raw offer ID'
    price = float(row['price_toman']) if text(row['price_toman']) is not None else None
    expected = {'id': oid, 'shop': row['shop_id'], 'title': row['seller_title'], 'description': text(row['description']),
        'price': price, 'updated': text(row['last_price_changed_at']), 'warranty': json.loads(row['warranty'])}
    expected_offers[oid] = (pid, digest(expected))
    for key, value in expected.items():
        if missing(value):
            offer_missing[key] += 1
    if price is not None and price > 0:
        minimum_prices[pid] = min(minimum_prices.get(pid, price), price)
assert meta['coverage']['offers'] == {'total': len(expected_offers), 'missing': dict(offer_missing), 'withDescription': len(expected_offers) - offer_missing['description'], 'liveStockConfirmations': 0}

expected_products, expected_index = {}, {}
product_missing, product_metrics, categories = Counter(), Counter(), Counter()
for row in rows('products'):
    pid = row['product_id']
    assert pid not in expected_products, 'Duplicate raw product ID'
    images, specs = json.loads(row['image_urls']), json.loads(row['specs'])
    shard = int(hashlib.md5(row['category_name'].encode()).hexdigest()[:8], 16) % 128
    expected = {'id': pid, 'title': row['persian_title'], 'category': row['category_name'], 'brand': text(row['brand_name']) or '',
        'model': text(row['model']), 'image': images[0] if images else '', 'images': images, 'specs': specs,
        'min': minimum_prices.get(pid), 'shard': shard}
    expected_products[pid] = digest(expected)
    expected_index[pid] = [pid, expected['title'], expected['category'], shard, expected['min']]
    categories[expected['category']] += 1
    for key in ('persian_title', 'brand_name', 'model'):
        if text(row[key]) is None:
            product_missing[key] += 1
    if not images:
        product_missing['image_urls'] += 1
    if not specs:
        product_missing['specs'] += 1
    product_metrics['specEntries'] += len(specs)
    product_metrics['imageURLs'] += len(images)
    product_metrics['productsWithMoreThan12Specs'] += len(specs) > 12
    product_metrics['productsWithMultipleImages'] += len(images) > 1
    product_metrics['maxSpecs'] = max(product_metrics['maxSpecs'], len(specs))
assert meta['coverage']['products'] == {'total': len(expected_products), 'missing': dict(product_missing), **product_metrics}
assert meta['categories'] == [list(pair) for pair in categories.most_common()]

seen_products, seen_offers = set(), set()
featured_hashes = {p['id']: digest(p) for p in featured}
assert len(featured_hashes) == len(featured) == 24
for shard in range(128):
    for pid, product in read('p' + str(shard)).items():
        assert pid == product['id'] and pid not in seen_products and product['shard'] == shard
        seen_products.add(pid)
        assert digest({key: value for key, value in product.items() if key != 'offers'}) == expected_products.get(pid), 'Full product field mismatch: ' + pid
        if pid in featured_hashes:
            assert product['category'] == 'کتانی و کفش اسپرت'
            assert digest(product) == featured_hashes[pid], 'Featured item differs from source shard'
        for offer in product['offers']:
            oid = offer['id']
            assert oid not in seen_offers, 'Duplicate output offer ID'
            seen_offers.add(oid)
            assert offer['shop'] in shops, 'Orphan shop'
            assert offer['price'] is None or offer['price'] >= 0
            assert expected_offers.get(oid) == (pid, digest(offer)), 'Full offer field/product linkage mismatch: ' + oid
assert seen_products == set(expected_products)
assert seen_offers == set(expected_offers)
assert set(featured_hashes).issubset(seen_products)

seen_index = set()
for n in range(8):
    for row in read('index' + str(n)):
        assert row[0] not in seen_index, 'Duplicate search index identity'
        seen_index.add(row[0])
        assert row == expected_index.get(row[0]), 'Search index/source field mismatch'
assert seen_index == seen_products
assert len(shops) == meta['shops'] == 6476
assert len(seen_products) == meta['products'] == 225903
assert len(seen_offers) == meta['offers'] == 331506
print('PASS: all source fields match full-record digests for 225903 products, 331506 offers and 6476 shops; index, featured data, metadata coverage and source SHA256 verified.')
print(json.dumps({'verified': True, 'coverage': meta['coverage'], 'payloadBytes': sum(p.stat().st_size for p in DATA.glob('*.json'))}, ensure_ascii=False))
