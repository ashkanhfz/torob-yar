import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRouting} from '../routing.mjs';
const points=[{lat:35.7,lon:51.4},{lat:35.75,lon:51.42}];
test('routing validates coordinates and waypoint limits before any upstream call',async()=>{
 let calls=0;const route=createRouting({baseURL:'http://localhost:5001',fetcher:()=>{calls++;throw Error()}});
 for(const value of [null,[],[points[0]],Array(7).fill(points[0]),[{lat:'35',lon:51},points[0]],[{lat:91,lon:51},points[0]],[{lat:35,lon:Infinity},points[0]]])assert.equal((await route(value)).status,400);
 assert.equal(calls,0);
});
test('route never invents distance when OSRM is absent or cannot snap a point',async()=>{
 assert.equal((await createRouting({baseURL:''})(points)).body.error,'routing_not_configured');
 assert.equal((await createRouting({baseURL:'http://localhost',fetcher:async()=>({ok:false,json:async()=>({code:'NoSegment'})})})(points)).status,422);
 assert.equal((await createRouting({baseURL:'http://localhost',fetcher:async()=>{throw Error('offline')}})(points)).status,502);
});
test('route uses lon-lat order, bounded snapping and actual engine values',async()=>{
 const route=createRouting({baseURL:'http://localhost:5001',fetcher:async(url)=>{
  assert.equal(url.origin,'http://localhost:5001');assert.equal(url.pathname,'/route/v1/driving/51.4,35.7;51.42,35.75');assert.equal(url.searchParams.get('radiuses'),'200;200');
  return {ok:true,json:async()=>({code:'Ok',routes:[{distance:1234,duration:567,geometry:{type:'LineString',coordinates:[[51.4,35.7],[51.42,35.75]]},legs:[{distance:1234,duration:567,steps:[{distance:1234,duration:567,name:'ولیعصر',maneuver:{type:'depart'}}]}]}],waypoints:[]})};
 }});const r=await route(points);assert.equal(r.status,200);assert.equal(r.body.distance,1234);assert.equal(r.body.duration,567);assert.equal(r.body.traffic,false);assert.equal(r.body.legs[0].steps[0].name,'ولیعصر');
});
