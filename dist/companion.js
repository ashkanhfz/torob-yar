/** Personal shopping workspace. All preferences stay on this device. */
export function initCompanion(api) {
  const {state, storage, $, esc, fa, icon, modal, toast, openProduct, search, toggleCompare} = api;
  const readList=(key)=>{const value=storage.get(key,[]);return Array.isArray(value)?value:[]};
  let favorites=readList('ty:favorites').slice(0,80), recent=readList('ty:recent').slice(0,10);
  let searches=readList('ty:searches').filter(x=>typeof x==='string').slice(0,7);
  let savedSearches=readList('ty:saved-searches').slice(0,12);
  const snapshot=p=>({id:p.id,title:p.title,category:p.category,image:p.image,min:p.min});
  const save=()=>{storage.set('ty:favorites',favorites);storage.set('ty:recent',recent)};
  const favoriteButton=p=>`<button data-favorite="${esc(p.id)}" aria-label="${favorites.some(x=>x.id===p.id)?'حذف از':'افزودن به'} علاقه‌مندی" aria-pressed="${favorites.some(x=>x.id===p.id)}" class="favorite-btn">${icon('heart')}</button>`;
  const workspace=document.createElement('section');
  workspace.className='personal-strip';workspace.setAttribute('aria-label','خریدهای شما');
  workspace.innerHTML=`<div><span class="live-dot"></span><strong>خرید بعدی‌ات را از همین‌جا ادامه بده</strong><span class="personal-hint">انتخاب‌ها روی همین دستگاه می‌مانند</span></div><div class="workspace-actions"><button id="favoritesBtn">${icon('heart')} علاقه‌مندی‌ها <span id="favoriteCount">۰</span></button><button id="recentBtn">${icon('clock')} دیده‌های اخیر</button><button id="savedSearchesBtn">${icon('search')} جستجوهای من</button></div>`;
  $('.steps').before(workspace);
  const tools=document.createElement('div');tools.className='result-tools';
  tools.innerHTML='<button id="saveSearch">+ ذخیرهٔ این جستجو</button><button id="shareSearch">اشتراک لینک جستجو ↗</button><span>برای جستجوی سریع، کلید / را بزن</span>';
  $('#activeFilters').before(tools);
  const dock=document.createElement('aside');dock.id='compareDock';dock.className='compare-dock';dock.hidden=true;
  dock.setAttribute('aria-label','گزینه‌های مقایسه');document.body.append(dock);
  const suggestions=document.createElement('datalist');suggestions.id='searchSuggestions';$('#query').after(suggestions);$('#query').setAttribute('list','searchSuggestions');
  function updateSuggestions(){suggestions.innerHTML=[...new Set([...searches,'گوشی سامسونگ تا ۲۰ میلیون','کتانی زیر ۲ میلیون','لپ تاپ',...(api.meta.categories||[]).slice(0,8).map(x=>x[0])])].map(x=>`<option value="${esc(x)}"></option>`).join('')}
  function refresh(){
    $('#favoriteCount').textContent=fa(favorites.length);
    $('#compareCount').textContent=fa(state.compare.length);
    document.querySelectorAll('[data-favorite]').forEach(el=>{const on=favorites.some(x=>x.id===el.dataset.favorite);el.setAttribute('aria-pressed',String(on));el.setAttribute('aria-label',(on?'حذف از':'افزودن به')+' علاقه‌مندی')});
    document.querySelectorAll('[data-compare]').forEach(el=>el.checked=state.compare.some(p=>p.id===el.dataset.compare));
    dock.hidden=!state.compare.length;document.body.classList.toggle('has-compare',!!state.compare.length);
    dock.innerHTML=`<div class="dock-label">${icon('compare')}<strong>${fa(state.compare.length)} انتخاب برای مقایسه</strong><small>حداکثر ۳ محصول</small></div><div class="dock-items">${state.compare.map(p=>`<div><span>${esc(p.title)}</span><button data-uncompare="${esc(p.id)}" aria-label="حذف ${esc(p.title)} از مقایسه">×</button></div>`).join('')}</div><button id="openCompareDock" class="primary" ${state.compare.length<2?'disabled':''}>مقایسه کن ${icon('arrow')}</button>`;
    $('#openCompareDock').onclick=()=>$('#compareBtn').click();
    storage.set('ty:compare',state.compare.map(p=>p.id));
    $('#savedTop').innerHTML=icon('heart')+' برنامهٔ خرید <span class="count-pill">'+fa(state.plan.length)+'</span>';
  }
  function cards(items){return items.map(p=>`<article class="collection-card"><div><span class="category">${esc(p.category||'انتخاب شما')}</span><button data-product="${esc(p.id)}">${esc(p.title)}</button><p>${p.min?fa(p.min)+' تومان':'قیمت نامشخص'} <small>· ثبت‌شده</small></p></div>${favoriteButton(p)}</article>`).join('')}
  function collection(kind){const items=kind==='favorites'?favorites:recent;modal(`<div class="eyebrow">انتخاب‌های شخصی شما</div><h2>${kind==='favorites'?'علاقه‌مندی‌ها':'آخرین محصولاتی که دیدی'}</h2><p>مدل‌های جذاب را نگه دار و در فرصت مناسب تصمیم بگیر.</p><div class="collection">${items.length?cards(items):'<div class="empty"><b>اولین انتخابت را پیدا کن</b><p>روی قلب کنار محصول بزن تا اینجا بماند.</p><button id="collectionExplore" class="primary">دیدن محصولات</button></div>'}</div>${items.length&&kind==='recent'?'<button id="clearRecent">پاک کردن سابقهٔ مشاهده</button>':''}`);if($('#collectionExplore'))$('#collectionExplore').onclick=()=>$('#modal').close();if($('#clearRecent'))$('#clearRecent').onclick=()=>{recent=[];save();collection('recent')}}
  function urlFor(product){const url=new URL(location.href);url.search='';if(state.query)url.searchParams.set('q',state.query);if($('#budget').value)url.searchParams.set('budget',$('#budget').value);if(product)url.searchParams.set('product',product);url.hash='';return url}
  function updateUrl(product){history.replaceState(null,'',urlFor(product))}
  async function share(product){const url=urlFor(product).href;try{await navigator.clipboard.writeText(url);toast('لینک کپی شد؛ می‌توانی برای دیگران بفرستی.')}catch{modal(`<h2>لینک انتخاب شما</h2><p>این لینک فقط محصول، عبارت جستجو و بودجه را دارد.</p><input readonly id="shareLink" dir="ltr" value="${esc(url)}">`);$('#shareLink').select()}}
  function showSearches(){modal(`<h2>جستجوهای ذخیره‌شده</h2><p>همان نیاز، همان بودجه؛ با یک کلیک ادامه بده.</p>${savedSearches.length?savedSearches.map((s,i)=>`<article class="saved-query"><button data-restore-search="${i}"><strong>${esc(s.query||'همهٔ محصولات')}</strong><small>${s.budget?'تا '+fa(s.budget)+' تومان':'بدون سقف بودجه'}${s.credit?' · اعتباری':''}</small></button><button data-delete-search="${i}" aria-label="حذف جستجوی ${esc(s.query)}">×</button></article>`).join(''):'<div class="empty">بعد از جستجو، «ذخیرهٔ این جستجو» را بزن.</div>'}`)}
  $('#favoritesBtn').onclick=()=>collection('favorites');$('#recentBtn').onclick=()=>collection('recent');$('#savedSearchesBtn').onclick=showSearches;
  $('#shareSearch').onclick=()=>share();
  $('#saveSearch').onclick=()=>{const entry={query:state.query,budget:$('#budget').value,radius:$('#radius').value,credit:$('#credit').checked,open:$('#openOnly').checked};savedSearches=[entry,...savedSearches.filter(s=>JSON.stringify(s)!==JSON.stringify(entry))].slice(0,12);storage.set('ty:saved-searches',savedSearches);toast('جستجو و فیلترها ذخیره شدند.')};
  document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;
    if(el.dataset.favorite){const id=el.dataset.favorite;const p=state.products.find(x=>x.id===id)||state.compare.find(x=>x.id===id)||[state.selected,...favorites,...recent].find(x=>x?.id===id);if(!p)return;if(favorites.some(x=>x.id===id))favorites=favorites.filter(x=>x.id!==id);else favorites=[snapshot(p),...favorites].slice(0,80);save();refresh();toast(favorites.some(x=>x.id===id)?'در علاقه‌مندی‌ها ذخیره شد.':'از علاقه‌مندی‌ها حذف شد.')}
    if(el.dataset.uncompare)toggleCompare(el.dataset.uncompare,false);
    if(el.dataset.restoreSearch!==undefined){const s=savedSearches[Number(el.dataset.restoreSearch)];if(!s)return;$('#budget').value=s.budget;$('#radius').value=s.radius;$('#credit').checked=s.credit;$('#openOnly').checked=s.open;$('#modal').close();search(s.query)}
    if(el.dataset.deleteSearch!==undefined){savedSearches.splice(Number(el.dataset.deleteSearch),1);storage.set('ty:saved-searches',savedSearches);showSearches()}
    if(el.id==='shareProduct')share(state.selected.id);
  });
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!document.activeElement?.isContentEditable&&!$('#modal').open){e.preventDefault();$('#query').focus()}});
  updateSuggestions();
  const restoreIds=readList('ty:compare').filter(x=>typeof x==='string').slice(0,3);
  refresh();
  return {refresh,favoriteButton,share,restoreIds,
    viewed(p){recent=[snapshot(p),...recent.filter(x=>x.id!==p.id)].slice(0,10);save();updateUrl(p.id)},
    catalog(){updateUrl()},
    searched(q){if(q){searches=[q,...searches.filter(x=>x!==q)].slice(0,7);storage.set('ty:searches',searches);updateSuggestions()}updateUrl()},
  };
}
