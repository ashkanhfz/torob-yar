from pathlib import Path
import gzip,json,base64
root=Path(__file__).resolve().parents[1]/'dist/data'
def read(n):return json.loads(gzip.decompress(base64.b64decode(json.loads((root/(n+'.json')).read_text())['gzip'])))
meta=read('meta');shops=read('shops');seen=set();count=0;offers=0
for i in range(128):
 for pid,p in read('p'+str(i)).items():
  assert pid==p['id'] and pid not in seen
  seen.add(pid);count+=1
  for o in p['offers']:
   assert o['shop'] in shops, 'orphan shop'
   assert o['price'] is None or o['price']>=0
   offers+=1
idx=[r for i in range(8) for r in read('index'+str(i))]
assert len(shops)==meta['shops']==6476
assert count==meta['products']==225903
assert offers==meta['offers']==331506
assert len(idx)==count and {r[0] for r in idx}==seen
assert all(p['id'] in seen and p['category']=='کتانی و کفش اسپرت' for p in read('featured'))
print('PASS: 225903 products, 331506 offers, 6476 shops; all identities linked; no orphan offers.')
