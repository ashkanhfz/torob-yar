import csv,json,sys,hashlib,gzip,base64
from pathlib import Path
from collections import defaultdict,Counter
csv.field_size_limit(10_000_000)
source=Path(sys.argv[1] if len(sys.argv)>1 else '../../work/data')
out=Path(__file__).resolve().parents[1]/'dist/data';out.mkdir(parents=True,exist_ok=True)
def rows(n):return csv.DictReader((source/(n+'.csv')).open(encoding='utf-8-sig'))
def parse(v):
 try:return json.loads(v)
 except:return None
def write(n,v):
 payload=json.dumps(v,ensure_ascii=False,separators=(',',':')).encode('utf-8')
 encoded=base64.b64encode(gzip.compress(payload,compresslevel=6,mtime=0)).decode('ascii')
 (out/n).write_text(json.dumps({'gzip':encoded},separators=(',',':')),encoding='utf-8')
shops={}
for s in rows('shops'):
 shops[s['shop_id']]={k:(parse(v) if k in ['weekly_hours','payment_options'] else float(v) if k in ['lat','lon'] and v!='null' else v if v!='null' else None) for k,v in s.items() if k not in ['contacts','category_names']}
write('shops.json',shops)
offers=defaultdict(list);oc=0
for o in rows('offers'):
 offers[o['product_id']].append({'shop':o['shop_id'],'id':o['offer_id'],'title':o['seller_title'],'price':float(o['price_toman']) if o['price_toman']!='null' else None,'updated':o['last_price_changed_at'],'warranty':parse(o['warranty'])});oc+=1
shards=[{} for _ in range(128)];index=[[] for _ in range(8)];cats=Counter();featured=[];pc=0
for p in rows('products'):
 pid=p['product_id'];sh=int(hashlib.md5(p['category_name'].encode()).hexdigest()[:8],16)%128
 imgs=parse(p['image_urls']) or [];os=offers.get(pid,[]);prices=[o['price'] for o in os if o['price'] and o['price']>0]
 item={'id':pid,'title':p['persian_title'],'category':p['category_name'],'brand':p['brand_name'] if p['brand_name']!='null' else '', 'image':imgs[0] if imgs else '', 'specs':(parse(p['specs']) or [])[:12],'offers':os,'min':min(prices) if prices else None,'shard':sh}
 shards[sh][pid]=item;index[pc%8].append([pid,item['title'],item['category'],sh,item['min']]);pc+=1;cats[item['category']]+=1
 if os and item['category']=='کتانی و کفش اسپرت':featured.append(item)
for i,x in enumerate(shards):write(f'p{i}.json',x)
for i,x in enumerate(index):write(f'index{i}.json',x)
featured.sort(key=lambda p:len(set(o['shop'] for o in p['offers'])),reverse=True)
featured=featured[:24]
write('featured.json',featured);write('meta.json',{'products':pc,'offers':oc,'shops':len(shops),'categories':cats.most_common(),'source':'starcoach-dataset-v16-cap300-csv','phonesSynthetic':True})
print(json.dumps({'products':pc,'offers':oc,'shops':len(shops),'featured':len(featured)}))
