import test from 'node:test';
import assert from 'node:assert/strict';
import {planArrival} from '../dist/arrival-window.js';

const closed={status:'closed'};
const shift=(start,end)=>({status:'declared',shifts:[{start_time:start,end_time:end}]});
const shop=(weekly_hours={})=>({weekly_hours:{sun:closed,mon:closed,tue:closed,wed:closed,thu:closed,fri:closed,sat:closed,...weekly_hours}});
const arrive=(s,departure,duration=0,visitMinutes=15)=>planArrival({shops:[s],departure,legs:[{duration}],visitMinutes})[0];

test('actual OSRM travel duration changes a currently open shop into closed at arrival',()=>{
  const s=shop({fri:shift('09:00:00','18:00:00')});
  assert.equal(arrive(s,'2026-10-23T17:40:00+03:30',0).status,'open');
  const result=arrive(s,'2026-10-23T17:40:00+03:30',20*60);
  assert.equal(result.status,'closed');
  assert.equal(result.arrival.toISOString(),'2026-10-23T14:30:00.000Z');
});

test('shopping window includes travel seconds and never rounds a short visit into enough time',()=>{
  const s=shop({fri:shift('09:00','18:00')});
  const exact=arrive(s,'2026-10-23T17:30:00+03:30',15*60);
  assert.equal(exact.status,'open');assert.equal(exact.remainingMinutes,15);
  const late=arrive(s,'2026-10-23T17:30:00+03:30',900.5);
  assert.equal(late.status,'too-short');assert.ok(late.remainingMinutes<15);
  assert.equal(late.closing.toISOString(),'2026-10-23T14:30:00.000Z');
  assert.equal(arrive(s,'2026-10-23T17:30:00+03:30',900,30).status,'too-short');
});

test('Tehran picker time and UTC departure represent the same instant regardless of host zone',()=>{
  const s=shop({fri:shift('17:00','18:00')});
  const local=arrive(s,'2026-10-23T17:30',600);
  const utc=arrive(s,'2026-10-23T14:00:00Z',600);
  assert.deepEqual(local,utc);assert.equal(local.status,'open');
  assert.equal(local.arrival.toISOString(),'2026-10-23T14:10:00.000Z');
});

test('overnight arrival uses the previous Tehran day including the Saturday to Sunday boundary',()=>{
  const friday=shop({thu:shift('20:00','02:00')});
  const morning=arrive(friday,'2026-10-22T23:50:00+03:30',20*60);
  assert.equal(morning.status,'open');assert.equal(morning.remainingMinutes,110);
  assert.equal(arrive(friday,'2026-10-23T01:50:00+03:30',10*60).status,'closed');
  const sunday=shop({sat:shift('22:00','01:00')});
  assert.equal(arrive(sunday,'2026-10-24T23:55:00+03:30',600).status,'open');
});

test('split shifts preserve the lunch closure while adjacent shifts form one continuous visit window',()=>{
  const split=shop({fri:{status:'declared',shifts:[{start_time:'09:00',end_time:'12:00'},{start_time:'13:00',end_time:'18:00'}]}});
  assert.equal(arrive(split,'2026-10-23T11:50:00+03:30').status,'too-short');
  assert.equal(arrive(split,'2026-10-23T12:30:00+03:30').status,'closed');
  const adjacent=shop({fri:{status:'declared',shifts:[{start_time:'09:00',end_time:'12:00'},{start_time:'12:00',end_time:'18:00'}]}});
  assert.equal(arrive(adjacent,'2026-10-23T11:50:00+03:30').status,'open');
});

test('missing unsupported and placeholder-only hours remain unknown instead of live-open claims',()=>{
  for(const s of [{},{weekly_hours:{fri:{status:'unsupported'}}},{weekly_hours:{fri:shift('00:00:00','00:00:00')}}]){
    const result=arrive(s,'2026-10-23T17:30:00+03:30',600);
    assert.equal(result.status,'unknown');assert.equal(result.remainingMinutes,null);
    assert.ok(result.arrival instanceof Date);
  }
  assert.equal(arrive({weekly_hours:{fri:closed}},'2026-10-23T01:00:00+03:30').status,'unknown');
  const withPlaceholder=shop({fri:{status:'declared',shifts:[{start_time:'09:00',end_time:'18:00'},{start_time:'00:00:00',end_time:'00:00:00'}]}});
  assert.equal(arrive(withPlaceholder,'2026-10-23T17:30:00+03:30').status,'open');
});

test('multiple stops accumulate each OSRM leg plus configured shopping time at prior stops',()=>{
  const s=shop({fri:shift('09:00','18:00')});
  const results=planArrival({shops:[s,s],departure:'2026-10-23T17:00:00+03:30',legs:[{duration:600},{duration:1200}],visitMinutes:20});
  assert.equal(results[0].arrival.toISOString(),'2026-10-23T13:40:00.000Z');
  assert.equal(results[0].departure.toISOString(),'2026-10-23T14:00:00.000Z');
  assert.equal(results[1].arrival.toISOString(),'2026-10-23T14:20:00.000Z');
  assert.equal(results[1].status,'too-short');assert.equal(results[1].remainingMinutes,10);
});

test('missing or malformed travel duration propagates unknown instead of guessing downstream arrival',()=>{
  const s=shop({fri:shift('09:00','18:00')});
  for(const duration of [undefined,null,-1,Infinity,'600'])assert.equal(planArrival({shops:[s],departure:'2026-10-23T17:00:00+03:30',legs:[{duration}]})[0].arrival,null);
  const result=planArrival({shops:[s,s,s],departure:'2026-10-23T17:00:00+03:30',legs:[{duration:60},{},{duration:60}]});
  assert.ok(result[0].arrival);assert.equal(result[1].arrival,null);assert.equal(result[2].arrival,null);
  assert.ok(result.slice(1).every(s=>s.status==='unknown'));
  assert.equal(arrive(s,'invalid',60).arrival,null);
  assert.equal(arrive(s,null,60).arrival,null);
  assert.equal(arrive(s,'2026-10-23T17:00:00+03:30',60,0).status,'unknown');
});
