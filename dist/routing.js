export function initRouting({state,shops,$,esc,fa,modal,toast,locationModal}) {
  let map=null,request=null;
  class RouteError extends Error {}
  const km=m=>m<1000?fa(Math.round(m))+' متر':fa((m/1000).toFixed(1))+' کیلومتر';
  const time=s=>{const m=Math.max(1,Math.round(s/60));return m<60?fa(m)+' دقیقه':fa(Math.floor(m/60))+' ساعت و '+fa(m%60)+' دقیقه'};
  const valid=s=>s&&Number.isFinite(s.lat)&&Number.isFinite(s.lon);
  function cleanup(){request?.abort();request=null;map?.stop();map?.remove();map=null}
  $('#modal').addEventListener('close',cleanup);
  const modifiers={'left':'چپ','right':'راست','slight left':'کمی به چپ','slight right':'کمی به راست','sharp left':'تند به چپ','sharp right':'تند به راست','straight':'مستقیم','uturn':'دور زدن'};
  function instruction(s){const m=s.maneuver||{},direction=modifiers[m.modifier]||'';let text=m.type==='depart'?'شروع حرکت':m.type==='arrive'?'رسیدن به مقصد':['roundabout','rotary'].includes(m.type)?'ورود به میدان'+(m.exit?'؛ خروجی '+fa(m.exit):''):m.type==='merge'?'پیوستن به مسیر':m.type==='fork'?'در دوراهی '+direction:m.type==='turn'?'گردش به '+direction:direction||'ادامهٔ مسیر';return text+(s.name?' · '+s.name:'')}
  async function show(ids){
    cleanup();ids=[...new Set(ids)];
    if(ids.length>5)return toast('برای هر مسیر حداکثر ۵ فروشگاه انتخاب کن.');
    const destinations=ids.map(id=>shops[id]);
    if(!destinations.length||destinations.some(s=>!valid(s)))return toast('مختصات معتبر برای همهٔ مقصدها ثبت نشده است.');
    if(!valid(state.point))return toast('ابتدا مبدأ مراجعه را مشخص کن.');
    const origin={...state.point},points=[origin,...destinations].map(({lat,lon})=>({lat,lon}));
    const external='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+origin.lat+','+origin.lon+'&destination='+destinations.at(-1).lat+','+destinations.at(-1).lon+(destinations.length>1?'&waypoints='+encodeURIComponent(destinations.slice(0,-1).map(s=>s.lat+','+s.lon).join('|')):'');
    modal(`<h2>مسیر مراجعه</h2><p class="small">مبدأ: ${esc(origin.label||'نقطهٔ انتخاب‌شده')} <button id="routeOrigin" class="outline">تغییر مبدأ</button></p><ol class="route-stops">${destinations.map(s=>`<li>${esc(s.name)}<small>${esc(s.address||'')}</small></li>`).join('')}</ol><p class="small">مسیر خودرو با ترتیب بالا محاسبه می‌شود. زمان، تخمینی و بدون ترافیک زنده است؛ موجودی و آدرس فروشگاه را پیش از حرکت تأیید کن.</p><div id="routeResult" role="status" aria-live="polite">در حال محاسبهٔ مسیر…</div><a class="outline route-external" target="_blank" rel="noopener" href="${esc(external)}">باز کردن همین مقصدها در گوگل‌مپ ↗</a>`);
    $('#routeOrigin').onclick=()=>{cleanup();locationModal()};
    const controller=new AbortController();request=controller;
    try{
      const response=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
      const r=await response.json();if(controller.signal.aborted)return;
      if(!response.ok){const messages={routing_not_configured:'مسیریابی داخلی روی این سرور فعال نیست. می‌توانی همین مقصدها را در گوگل‌مپ باز کنی.',route_not_found:'در نقشهٔ موجود مسیری نزدیک این مختصات پیدا نشد. مبدأ و آدرس مقصد را بررسی کن.',rate_limit:'کمی بعد دوباره امتحان کن.'};throw new RouteError(messages[r.error]||'سرویس مسیریابی در دسترس نیست. دوباره تلاش کن یا نقشهٔ بیرونی را باز کن.')}
      const box=$('#routeResult');if(!box)return;
      box.innerHTML=`<div class="route-summary"><strong>${km(r.distance)}</strong><strong>حدود ${time(r.duration)}</strong><span>خودرو · بدون ترافیک</span></div><div id="routeMap" aria-label="نقشهٔ مسیر خودرو"></div><p class="small">نقشه: OpenStreetMap · محاسبه: OSRM</p>${r.legs.map((leg,i)=>`<details class="route-leg" ${r.legs.length===1?'open':''}><summary>تا ${esc(destinations[i]?.name)} · ${km(leg.distance)} · ${time(leg.duration)}</summary><ol>${leg.steps.map(s=>`<li><span>${esc(instruction(s))}</span><small>${km(s.distance)}</small></li>`).join('')}</ol></details>`).join('')}`;
      if(globalThis.L){map=L.map('routeMap',{scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([origin.lat,origin.lon],12);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);const line=L.geoJSON(r.geometry,{style:{color:'#e91e33',weight:5,opacity:.85}}).addTo(map);points.forEach((p,i)=>L.circleMarker([p.lat,p.lon],{radius:8,color:i?'#e91e33':'#1e293b',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(map).bindTooltip(i?`${fa(i)}. ${esc(destinations[i-1].name)}`:'مبدأ'));map.fitBounds(line.getBounds(),{padding:[24,24],animate:false});requestAnimationFrame(()=>map?.invalidateSize())}else $('#routeMap').textContent='نمایش نقشه در دسترس نیست؛ راهنمای مسیر در پایین آمده است.';
    }catch(error){if(!controller.signal.aborted&&$('#routeResult'))$('#routeResult').textContent=error.name==='TimeoutError'?'دریافت مسیر طول کشید؛ دوباره تلاش کن.':error instanceof RouteError?error.message:'نمایش مسیر ممکن نشد؛ دوباره تلاش کن یا نقشهٔ بیرونی را باز کن.'}
  }
  document.addEventListener('click',e=>{const shop=e.target.closest('[data-route-shop]');if(shop)show([shop.dataset.routeShop]);if(e.target.closest('[data-route-plan]'))show(state.plan.map(p=>p.shop))});
  // App dialogs share one host; release map and pending requests when another dialog replaces this one.
  new MutationObserver(()=>{if(request&&!$('#routeResult'))cleanup()}).observe($('#modalBody'),{childList:true});
  return {show};
}
