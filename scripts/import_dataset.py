"""Import every supplied v16 field, retaining the app's established aliases."""
import base64
import csv
import gzip
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

csv.field_size_limit(10_000_000)
ROOT = Path(__file__).resolve().parents[1]
SOURCE_COLUMNS = {
    'products': {'brand_name', 'category_name', 'image_urls', 'model', 'persian_title', 'product_id', 'specs'},
    'offers': {'description', 'last_price_changed_at', 'offer_id', 'price_toman', 'product_id', 'seller_title', 'shop_id', 'warranty'},
    'shops': {'address', 'category_names', 'contacts', 'instagram', 'lat', 'location_label', 'lon', 'name', 'payment_options', 'shop_id', 'supports_fast_delivery', 'website_url', 'weekly_hours'},
}


def nullable(value):
    return None if value in ('null', '') else value


def file_sha256(file):
    digest = hashlib.sha256()
    with file.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def records(source, name):
    with (source / (name + '.csv')).open(encoding='utf-8-sig', newline='') as handle:
        yield from csv.DictReader(handle)


def write(out, name, value):
    payload = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    encoded = base64.b64encode(gzip.compress(payload, compresslevel=6, mtime=0)).decode('ascii')
    target = out / name
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps({'gzip': encoded}, separators=(',', ':')), encoding='utf-8')
    temporary.replace(target)


def main(source):
    out = ROOT / 'dist/data'
    out.mkdir(parents=True, exist_ok=True)
    coverage = {name: {'missing': Counter()} for name in ('products', 'offers', 'shops')}
    source_files = {}
    for name in coverage:
        file = source / (name + '.csv')
        with file.open(encoding='utf-8-sig', newline='') as handle:
            columns = next(csv.reader(handle))
        if set(columns) != SOURCE_COLUMNS[name] or len(columns) != len(SOURCE_COLUMNS[name]):
            raise ValueError('Source schema changed; map every field before importing: ' + name)
        source_files[name] = {'sha256': file_sha256(file), 'bytes': file.stat().st_size, 'columns': columns}

    shops = {}
    hours_status = Counter()
    for row in records(source, 'shops'):
        item = {}
        for key, value in row.items():
            if key in ('weekly_hours', 'payment_options', 'category_names', 'contacts'):
                item[key] = json.loads(value)
            elif key in ('lat', 'lon'):
                item[key] = float(value) if nullable(value) is not None else None
            elif key == 'supports_fast_delivery':
                parsed = json.loads(value)
                if parsed is not None and not isinstance(parsed, bool):
                    raise ValueError('Invalid supports_fast_delivery boolean')
                item[key] = parsed
            else:
                item[key] = nullable(value)
        # All numbers in the official challenge source are synthetic, not live contacts.
        item['contactsSynthetic'] = True
        if item['shop_id'] in shops:
            raise ValueError('Duplicate shop identity')
        shops[item['shop_id']] = item
        for key, value in item.items():
            if key != 'contactsSynthetic' and (value is None or value == '' or value == [] or value == {}):
                coverage['shops']['missing'][key] += 1
        for hours in (item.get('weekly_hours') or {}).values():
            hours_status[hours.get('status', 'unknown')] += 1
    coverage['shops'].update({'total': len(shops), 'contactsSynthetic': len(shops), 'weeklyHoursDayStatus': hours_status,
        'fastDeliveryTrue': sum(s['supports_fast_delivery'] is True for s in shops.values()),
        'fastDeliveryFalse': sum(s['supports_fast_delivery'] is False for s in shops.values()),
        'hasPublicWebsite': sum(bool(s['website_url']) for s in shops.values()),
        'hasInstagram': sum(bool(s['instagram']) for s in shops.values())})
    write(out, 'shops.json', shops)

    offers = defaultdict(list)
    offer_ids = set()
    for row in records(source, 'offers'):
        if row['offer_id'] in offer_ids:
            raise ValueError('Duplicate offer identity')
        if row['shop_id'] not in shops:
            raise ValueError('Offer refers to unknown shop')
        offer_ids.add(row['offer_id'])
        item = {'shop': row['shop_id'], 'id': row['offer_id'], 'title': row['seller_title'],
            'description': nullable(row['description']),
            'price': float(row['price_toman']) if nullable(row['price_toman']) is not None else None,
            'updated': nullable(row['last_price_changed_at']), 'warranty': json.loads(row['warranty'])}
        offers[row['product_id']].append(item)
        for key, value in item.items():
            if value is None or value == '' or value == [] or value == {}:
                coverage['offers']['missing'][key] += 1
    coverage['offers'].update({'total': len(offer_ids), 'withDescription': len(offer_ids) - coverage['offers']['missing']['description'], 'liveStockConfirmations': 0})

    shards = [{} for _ in range(128)]
    index = [[] for _ in range(8)]
    categories = Counter()
    featured = []
    product_ids = set()
    product_counts = Counter()
    for row in records(source, 'products'):
        pid = row['product_id']
        if pid in product_ids:
            raise ValueError('Duplicate product identity')
        product_ids.add(pid)
        shard = int(hashlib.md5(row['category_name'].encode()).hexdigest()[:8], 16) % 128
        images, specs = json.loads(row['image_urls']), json.loads(row['specs'])
        if not isinstance(images, list) or not isinstance(specs, list):
            raise ValueError('Invalid product images/specs array')
        product_offers = offers.pop(pid, [])
        prices = [o['price'] for o in product_offers if o['price'] is not None and o['price'] > 0]
        item = {'id': pid, 'title': row['persian_title'], 'category': row['category_name'],
            'brand': nullable(row['brand_name']) or '', 'model': nullable(row['model']),
            'image': images[0] if images else '', 'images': images, 'specs': specs,
            'offers': product_offers, 'min': min(prices) if prices else None, 'shard': shard}
        shards[shard][pid] = item
        ordinal = len(product_ids) - 1
        index[ordinal % 8].append([pid, item['title'], item['category'], shard, item['min']])
        categories[item['category']] += 1
        if product_offers and item['category'] == 'کتانی و کفش اسپرت':
            featured.append(item)
        for key in ('persian_title', 'brand_name', 'model'):
            if nullable(row[key]) is None:
                coverage['products']['missing'][key] += 1
        if not images:
            coverage['products']['missing']['image_urls'] += 1
        if not specs:
            coverage['products']['missing']['specs'] += 1
        product_counts['specEntries'] += len(specs)
        product_counts['imageURLs'] += len(images)
        product_counts['productsWithMoreThan12Specs'] += len(specs) > 12
        product_counts['productsWithMultipleImages'] += len(images) > 1
        product_counts['maxSpecs'] = max(product_counts['maxSpecs'], len(specs))
    if offers:
        raise ValueError('Offer refers to unknown product')
    coverage['products'].update({'total': len(product_ids), **product_counts})

    for i, shard in enumerate(shards):
        write(out, f'p{i}.json', shard)
    for i, rows in enumerate(index):
        write(out, f'index{i}.json', rows)
    featured.sort(key=lambda p: len({o['shop'] for o in p['offers']}), reverse=True)
    featured = featured[:24]
    write(out, 'featured.json', featured)
    meta = {'products': len(product_ids), 'offers': len(offer_ids), 'shops': len(shops),
        'categories': categories.most_common(), 'source': 'starcoach-dataset-v16-cap300-csv',
        'phonesSynthetic': True, 'contactsSynthetic': True, 'dataSchema': 2,
        'sourceFiles': source_files, 'coverage': coverage}
    write(out, 'meta.json', meta)
    print(json.dumps({'products': len(product_ids), 'offers': len(offer_ids), 'shops': len(shops), 'featured': len(featured), 'coverage': coverage}, ensure_ascii=False))


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.data/csv')
