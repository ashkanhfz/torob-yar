import {formatDate} from './dates.js';
import {normalizeSearch} from './search.js';

const STORAGE_KEY='ty:visit-kit:v1';
const CHECK_IDS=['model','stock','hours','address','payment'];
const MAX_RECORDS=40;
const NOTE_LIMIT=600;

function productHint(product){
 const text=normalizeSearch(`${product.category||''} ${product.title||''}`);
 if(/شارژر|پاوربانک/.test(text))return 'نوع درگاه، توان شارژ و سازگاری با دستگاهت را بپرس.';
 if(/کفش|کتانی|پوشاک|پیراهن|شلوار|مانتو/.test(text))return 'سایز، رنگ، امکان امتحان کردن و تعویض را بپرس.';
 if(/گوشی|موبایل/.test(text)&&!/قاب|کاور|گلس|محافظ|باتری|قطعه/.test(text))return 'مدل، حافظه، رنگ، رجیستری و وضعیت فعال‌سازی را بررسی کن.';
 if(/لپ تاپ|laptop/.test(text)&&!/کیف|باتری|پایه|قطعه/.test(text))return 'مدل دقیق، پردازنده، حافظه، رم و وضعیت پلمب را تطبیق بده.';
 return 'مدل دقیق، رنگ یا اندازه و لوازم همراه را با نیازت تطبیق بده.';
}

function validPrice(value){return Number.isFinite(Number(value))&&Number(value)>0?Number(value):null}
function pickOffer(product,shopId){
 return (product.offers||[]).filter(o=>o.shop===shopId).sort((a,b)=>(validPrice(a.price)||Infinity)-(validPrice(b.price)||Infinity))[0]||null;
}

/** The questions reference catalogue facts; checking a box is always the user's own note. */
export function visitChecklist(product,shop,offer,fa=n=>Number(n).toLocaleString('fa-IR')){
 const offerTitle=offer?.title&&offer.title!==product.title?`عنوان فروشنده: ${offer.title}. `:'';
 const price=validPrice(offer?.price);
 return [
  {id:'model',title:'مدل و مشخصات را تطبیق دادم',hint:offerTitle+productHint(product)},
  {id:'stock',title:'قیمت امروز و موجودی را پرسیدم',hint:price?`قیمت ثبت‌شده: ${fa(price)} تومان؛ قیمت نهایی و موجودی همین مدل را بپرس.`:'قیمت نهایی و موجودی همین مدل را از فروشگاه بپرس.'},
  {id:'hours',title:'زمان مراجعه را هماهنگ کردم',hint:'برای ساعت رسیدنت، باز بودن فروشگاه و امکان نگه داشتن کالا را بپرس.'},
  {id:'address',title:'آدرس، طبقه و واحد را بررسی کردم',hint:shop?.address||shop?.location_label||'نشانی دقیق، ورودی پاساژ، طبقه و واحد را از فروشگاه بگیر.'},
  {id:'payment',title:'شرایط پرداخت و ضمانت را پرسیدم',hint:'روش پرداخت، فاکتور، ضمانت و مهلت تست یا تعویض را روشن کن.'},
 ];
}

export function visitInquiry(product,shop,offer,fa=n=>Number(n).toLocaleString('fa-IR')){
 const lines=[`سلام، برای خرید حضوری «${product.title}» پرس‌وجو می‌کنم.`];
 if(offer?.title&&offer.title!==product.title)lines.push(`عنوان پیشنهاد شما «${offer.title}» است؛ آیا همین مدل و مشخصات را دارد؟`);
 const price=validPrice(offer?.price);
 lines.push(price?`قیمت ثبت‌شده ${fa(price)} تومان است. قیمت امروز و موجودی این مدل چقدر است؟`:'این مدل موجود است و قیمت نهایی امروز چقدر است؟');
 lines.push(productHint(product),'تا چه ساعتی برای مراجعه باز هستید؟ امکان نگه داشتن کالا تا رسیدن من هست؟');
 if(shop?.address||shop?.location_label)lines.push(`آدرس ثبت‌شده: ${shop.address||shop.location_label}. آدرس، طبقه و واحد درست است؟`);
 else lines.push('آدرس دقیق، ورودی، طبقه و واحد کجاست؟');
 lines.push('روش پرداخت، فاکتور، ضمانت و مهلت تست یا تعویض چه شرایطی دارد؟');
 return lines.join('\n');
}

export function initVisitKit({state,storage,$,esc,fa,modal,toast,shops}){
 function read(){
  const raw=storage.get(STORAGE_KEY,[]);
  if(!Array.isArray(raw))return [];
  return raw.filter(r=>r&&typeof r.key==='string'&&r.key.length<512&&Number.isFinite(Date.parse(r.at)))
   .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,MAX_RECORDS)
   .map(r=>({key:r.key,at:r.at,note:typeof r.note==='string'?r.note.slice(0,NOTE_LIMIT):'',checks:CHECK_IDS.filter(id=>Array.isArray(r.checks)&&r.checks.includes(id))}));
 }
 function persist(record){
  const records=read().filter(r=>r.key!==record.key);
  storage.set(STORAGE_KEY,[{...record,checks:[...record.checks]},...records].slice(0,MAX_RECORDS));
 }
 function open(product,shopOrId){
  if(!product?.id||!product?.title){toast('ابتدا یک محصول انتخاب کن.');return}
  const ids=[...new Set((product.offers||[]).map(o=>o.shop).filter(id=>typeof id==='string'&&shops[id]))];
  const requested=typeof shopOrId==='string'?shopOrId:shopOrId?.shop||shopOrId?.id||(shopOrId?Object.keys(shops).find(id=>shops[id]===shopOrId):'');
  let shopId=ids.includes(requested)?requested:'';
  let record,timer;
  const flush=()=>{if(timer){clearTimeout(timer);timer=null;persist(record)}};
  function render(){
   const shop=shops[shopId],offer=pickOffer(product,shopId),key=JSON.stringify([product.id,shopId]);
   record=read().find(r=>r.key===key)||{key,checks:[],note:'',at:''};
   const checks=visitChecklist(product,shop,offer,fa);
   modal(`<section class="visit-kit" aria-labelledby="visitKitTitle"><span class="visit-kit-eyebrow">یادداشت خودت</span><h2 id="visitKitTitle">قبل از رفتن</h2><p class="visit-kit-product">${esc(product.title)}</p>${ids.length?`<label class="visit-kit-store" for="visitKitShop">برای کدام فروشگاه؟<select id="visitKitShop"><option value="">هنوز انتخاب نکرده‌ام</option>${ids.map(id=>`<option value="${esc(id)}" ${id===shopId?'selected':''}>${esc(shops[id].name||'فروشگاه بدون نام')}</option>`).join('')}</select></label>`:''}<div class="visit-kit-progress"><span id="visitKitCount" role="status" aria-live="polite"></span><progress id="visitKitProgress" max="5" value="${record.checks.length}" aria-label="موارد بررسی‌شده توسط خودت"></progress></div><div class="visit-kit-checks">${checks.map(c=>`<label class="visit-kit-check"><input type="checkbox" data-visit-kit-check="${c.id}" ${record.checks.includes(c.id)?'checked':''}><span><strong>${esc(c.title)}</strong><small>${esc(c.hint)}</small></span></label>`).join('')}</div><details class="visit-kit-note" ${record.note?'open':''}><summary>یادداشت کوتاه <span>اختیاری</span></summary><label for="visitKitNote" class="visit-kit-sr">یادداشت کوتاه دربارهٔ مراجعه</label><textarea id="visitKitNote" rows="2" maxlength="${NOTE_LIMIT}" placeholder="مثلاً قیمت گفته‌شده، ساعت هماهنگ‌شده یا سؤال باقی‌مانده…">${esc(record.note)}</textarea></details><p class="visit-kit-status" id="visitKitSaved"></p><div class="visit-kit-actions"><button id="visitKitCopy" class="primary">کپی متن پرسش از فروشگاه</button><button id="visitKitSummary">کپی یادداشت مراجعه</button><button id="visitKitReset" class="visit-kit-reset">پاک کردن تیک‌ها</button></div><details class="visit-kit-message"><summary>متن پرسش از فروشگاه</summary><textarea id="visitKitMessage" readonly aria-label="متن پرسش از فروشگاه">${esc(visitInquiry(product,shop,offer,fa))}</textarea></details><div id="visitKitCopyFallback" hidden><label for="visitKitCopyText">متن را انتخاب و کپی کن</label><textarea id="visitKitCopyText" readonly></textarea></div><p class="visit-kit-disclaimer">تیک‌ها و یادداشت‌ها فقط روی این مرورگر ذخیره می‌شوند؛ تأیید فروشگاه یا بررسی زنده نیستند.</p></section>`);
   function status(){
    $('#visitKitCount').textContent=`${fa(record.checks.length)} از ${fa(CHECK_IDS.length)} مورد را بررسی کرده‌ای`;
    $('#visitKitProgress').value=record.checks.length;
    $('#visitKitSaved').textContent=record.at?`آخرین ویرایش یادداشت خودت: ${formatDate(record.at,true)}`:'بعد از پرس‌وجو، موارد بررسی‌شده را علامت بزن.';
    $('#visitKitReset').disabled=!record.checks.length;
   }
   function update(immediate=true){record.at=new Date().toISOString();clearTimeout(timer);timer=null;if(immediate)persist(record);else timer=setTimeout(()=>{timer=null;persist(record)},300);status()}
   const root=$('.visit-kit');
   root.onchange=e=>{
    if(e.target.id==='visitKitShop'){flush();shopId=e.target.value;render();return}
    const id=e.target.dataset.visitKitCheck;
    if(!CHECK_IDS.includes(id))return;
    record.checks=e.target.checked?[...new Set([...record.checks,id])]:record.checks.filter(x=>x!==id);update();
   };
   $('#visitKitNote').oninput=e=>{record.note=e.target.value.slice(0,NOTE_LIMIT);update(false)};
   $('#visitKitNote').onblur=flush;
   $('#visitKitReset').onclick=()=>{record.checks=[];update();root.querySelectorAll('[data-visit-kit-check]').forEach(el=>{el.checked=false});toast('تیک‌های این یادداشت پاک شدند.')};
   async function copy(text){
    try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);toast('متن کپی شد.')}
    catch{if(!root.isConnected)return;const box=$('#visitKitCopyFallback'),field=$('#visitKitCopyText');box.hidden=false;field.value=text;field.focus();field.select();toast('کپی خودکار ممکن نشد؛ متن انتخاب‌شده را کپی کن.')}
   }
   $('#visitKitCopy').onclick=()=>copy(visitInquiry(product,shop,offer,fa));
   $('#visitKitSummary').onclick=()=>{flush();const lines=['یادداشت شخصی برای مراجعه',product.title];if(shop){lines.push(shop.name||'فروشگاه بدون نام',shop.address||shop.location_label||'آدرس نامشخص')}lines.push(...checks.map(c=>`${record.checks.includes(c.id)?'✓':'□'} ${c.title}`));if(record.note)lines.push(`یادداشت: ${record.note}`);if(record.at)lines.push(`آخرین ویرایش: ${formatDate(record.at,true)}`);lines.push('این موارد یادداشت شخصی هستند؛ تأیید فروشگاه یا بررسی زنده نیستند.');return copy(lines.join('\n'))};
   status();
  }
  render();
 }
 return {open};
}
