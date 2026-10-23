import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAdvisor} from '../advisor.mjs';

const input={message:'کدام برای گوشی من بهتر است؟',products:[
 {id:'p',title:'شارژر الف',min:10,specs:[{key:'توان',value:'۲۰ وات'}]},
 {id:'q',title:'شارژر ب',min:20,specs:[{key:'توان',value:'۳۰ وات'}]}
]};
async function fixture(run,{requests='10',tokens='30000'}={}){
 const directory=await mkdtemp(path.join(os.tmpdir(),'torob-ai-'));
 const env={AI_BASE_URL:'https://example.test/v1',AI_API_KEY:'test',AI_MODEL:'requested-model',AI_DAILY_REQUESTS:requests,AI_DAILY_TOKENS:tokens};
 const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 let time=Date.now(),calls=0,content='راهنمای خرید';
 const options={directory,now:()=>time,fetcher:async(url,opts)=>{
  calls++;assert.equal(url,'https://example.test/v1/chat/completions');
  const payload=JSON.parse(opts.body);assert.equal(payload.max_tokens,600);assert.equal(payload.model,'requested-model');assert.deepEqual(payload.reasoning,{effort:'none'});
  return {ok:true,json:async()=>({choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}})};
 }};
 try{await run({options,directory,calls:()=>calls,advance:(ms=61000)=>time+=ms,respond:value=>content=typeof value==='string'?value:JSON.stringify(value)})}
 finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}await rm(directory,{recursive:true,force:true})}
}

test('deduplicates paid calls and reuses durable answers after restart without spending exhausted budget',()=>fixture(async({options,directory,calls,advance})=>{
 let advisor=createAdvisor(options);
 const answers=await Promise.all([advisor.answer(input),advisor.answer(input)]);
 assert.equal(calls(),1);assert.equal(answers[0].mode,'model');
 assert.equal((await advisor.answer(input)).cached,true);
 advance();assert.equal(await advisor.answer({...input,message:'different'}),null);
 advisor=createAdvisor(options);
 assert.equal((await advisor.answer(input)).cached,true);
 assert.equal(await advisor.answer({...input,message:'after restart'}),null);
 assert.equal(calls(),1);
 const usage=await advisor.usage();assert.equal(usage.requests,1);assert.equal(usage.outputTokens,20);assert.ok(usage.reservedTokens>0);assert.equal(usage.cacheHits,2);
 const saved=JSON.parse(await readFile(path.join(directory,'ai-cache.json'),'utf8'));
 assert.equal(saved.entries.length,1);assert.equal(saved.entries[0][1].answer.message,'راهنمای خرید');
},{requests:'1'}));

test('accepts only recommendation IDs with matching snapshot evidence and supplies visit questions',()=>fixture(async({options,respond})=>{
 respond({recommendedId:'q',reason:'توان ثبت‌شدهٔ این گزینه ۳۰ وات است.',evidence:[{productId:'q',key:'توان',value:'۳۰ وات'},{productId:'p',key:'توان',value:'۲۰۰ وات'}],tradeoffs:['سازگاری گوشی با این توان نیاز به بررسی دارد.'],questions:['گوشی من با این شارژر سازگار است؟'],unknowns:['پروتکل شارژ ذکر نشده است.']});
 const result=await createAdvisor(options).answer(input);
 assert.equal(result.decision.recommendedId,'q');assert.deepEqual(result.decision.evidence,[{productId:'q',key:'توان',value:'۳۰ وات'}]);
 assert.equal(result.decision.questions.length,2);assert.match(result.message,/شارژر ب/);assert.match(result.message,/تأیید نشده/);assert.equal(result.decision.unknowns.length,2);
}));

test('rejects unknown selections and unsupported specs without retaining recommendation claims',()=>fixture(async({options,respond,advance})=>{
 const advisor=createAdvisor(options);
 for(const payload of [
  {recommendedId:'invented',evidence:[{productId:'invented',key:'توان',value:'۱۰۰ وات'}]},
  {recommendedId:'p',evidence:[{productId:'p',key:'توان',value:'۱۰۰ وات'}]},
  {recommendedId:'p',evidence:[{productId:'q',key:'توان',value:'۳۰ وات'}]},
  {recommendedId:'p',evidence:[]}
 ]){
  respond({...payload,reason:'توصیهٔ ساختگی',tradeoffs:['تفاوت ساختگی']});
  const result=await advisor.answer({...input,message:JSON.stringify(payload)});
  assert.equal(result.decision.recommendedId,null);assert.equal(result.decision.tradeoffs.length,0);
  assert.doesNotMatch(result.message,/ساختگی/);assert.ok(result.decision.questions.length>=2);advance();
 }
},{tokens:'100000'}));

test('expires durable answers after one hour and respects the token reservation cap',()=>fixture(async({options,advance,calls})=>{
 await createAdvisor(options).answer(input);assert.equal(calls(),1);
 advance(3600001);const next=await createAdvisor(options).answer(input);assert.notEqual(next.cached,true);assert.equal(calls(),2);
 process.env.AI_DAILY_TOKENS='1';advance();assert.equal(await createAdvisor(options).answer({...input,message:'new question'}),null);assert.equal(calls(),2);
}));

test('fails closed on unreadable durable cache and never calls provider',()=>fixture(async({options,directory,calls})=>{
 await writeFile(path.join(directory,'ai-cache.json'),'broken JSON');
 assert.equal(await createAdvisor(options).answer(input),null);assert.equal(calls(),0);
}));


test('does not display or cache truncated JSON and keeps the paid-call reservation',()=>fixture(async({options,respond,calls})=>{
 respond('{"recommendedId":"p","reason":"unfinished');
 const advisor=createAdvisor(options);assert.equal(await advisor.answer(input),null);assert.equal(calls(),1);
 assert.equal(await advisor.answer(input),null);assert.equal(calls(),1);
 const usage=await advisor.usage();assert.equal(usage.requests,1);assert.equal(usage.failures,1);assert.equal(usage.outputTokens,20);assert.equal(usage.lastFailure.code,'invalid_answer');assert.equal(usage.lastFailure.providerStatus,200);assert.equal(usage.lastFailure.finishReason,'stop');
}));


test('records only bounded provider diagnostic metadata, never response bodies',()=>fixture(async({options})=>{
 const advisor=createAdvisor({...options,fetcher:async()=>({ok:false,status:429,json:async()=>({error:'private-provider-response'})})});
 assert.equal(await advisor.answer(input),null);
 const usage=await advisor.usage();assert.equal(usage.lastFailure.code,'provider_failed');assert.equal(usage.lastFailure.providerStatus,429);assert.equal(usage.lastFailure.finishReason,null);assert.doesNotMatch(JSON.stringify(usage),/private-provider-response|test-key/);
}));
