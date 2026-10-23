/** Optional advice stays alongside the user's own shortlist. No automatic model calls. */
export function initAdvisorUI({state,$,esc,fa,modal,toast,search,close,parseAmount}){
 function open({products=[]}={}){
  const selected=products.slice(0,3),comparison=selected.length>1;
  modal(`<section class="advisor-panel"><p class="small">راهنمای انتخاب</p><h2>${comparison?'کدام گزینه به نیازت نزدیک‌تر است؟':'برای انتخاب بهتر کمک بگیر'}</h2>${comparison?`<div class="advisor-shortlist">${selected.map((p,i)=>`<span>${fa(i+1)}. ${esc(p.title)}</span>`).join('')}</div>`:`<label>چه کالایی می‌خواهی؟<input id="advisorQuery" value="${esc(state.query)}" placeholder="مثلاً شارژر گوشی سامسونگ" maxlength="200"></label>`}<label>چه چیزی برایت مهم‌تر است؟<textarea id="advisorMessage" rows="3" maxlength="1200" placeholder="مثلاً هر روز همراهم است؛ وزن کمتر مهم‌تر از امکانات بیشتر است."></textarea></label><p class="small">با زدن بررسی، پیام و مشخصات این گزینه‌ها به هوش لیارا فرستاده می‌شود.</p><button id="advisorSend" class="primary">${comparison?'مقایسه بر اساس نیاز من':'بررسی گزینه‌ها'}</button><div id="advisorAnswer" role="status" aria-live="polite" hidden></div></section>`);
  const button=$('#advisorSend'),box=$('#advisorAnswer'),input=$('#advisorMessage');input.focus();
  button.onclick=async()=>{
   const message=input.value.trim(),query=comparison?selected[0].category:$('#advisorQuery').value.trim();if(!message||!query)return toast('نام کالا و نیازت را بنویس.');
   button.disabled=true;button.textContent='در حال بررسی…';box.hidden=false;box.innerHTML='<p class="small">مشخصات گزینه‌ها را با نیازت مقایسه می‌کنم…</p>';
   try{
    const r=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,query,budget:parseAmount($('#budget').value)||0,...(comparison?{productIds:selected.map(p=>p.id)}:{})}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error();const j=await r.json();if(!box.isConnected)return;
    const candidates=j.products||[],decision=j.decision,recommended=candidates.find(p=>p.id===decision?.recommendedId);
    const list=(items,cls='')=>Array.isArray(items)&&items.length?`<ul class="${cls}">${items.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'';
    box.innerHTML=`<p class="advisor-source">${j.mode==='model'?'پیشنهاد هوش لیارا':'راهنمای مقایسه'}${j.cached?' · پاسخ ذخیره‌شده':''}</p>${recommended?`<div class="advisor-recommendation"><strong>${esc(recommended.title)}</strong><p>${esc(decision.reason||'')}</p><button data-product="${esc(recommended.id)}">بررسی فروشگاه‌های این گزینه ←</button></div>`:`<p class="advisor-message">${esc(decision?.reason||j.message||'')}</p>`}${decision?.evidence?.length?`<details><summary>این پیشنهاد بر چه مشخصاتی تکیه دارد؟</summary>${list(decision.evidence.map(e=>`${candidates.find(p=>p.id===e.productId)?.title||'محصول'} · ${e.key}: ${e.value}`))}</details>`:''}${list(decision?.tradeoffs)}${decision?.questions?.length?`<h3>پیش از خرید بپرس</h3>${list(decision.questions)}`:''}${decision?.unknowns?.length?`<details><summary>چه چیزهایی هنوز معلوم نیست؟</summary>${list(decision.unknowns)}</details>`:''}${j.notice?`<p class="small">${esc(j.notice)}</p>`:''}<p class="small">موجودی و قیمت امروز باید از فروشگاه پرسیده شود.</p>${!recommended&&candidates.length?`<div class="advisor-options">${candidates.map(p=>`<button data-product="${esc(p.id)}">${esc(p.title)} ←</button>`).join('')}</div>`:''}`;
   }catch{if(box.isConnected)box.innerHTML='<p>پاسخ دریافت نشد. انتخاب‌هایت حفظ شده؛ می‌توانی دوباره تلاش کنی یا مشخصات را مقایسه کنی.</p>'}
   finally{if(button.isConnected){button.disabled=false;button.textContent='بررسی دوباره'}}
  };
 }
 return {open};
}
