/** The gallery requests only the selected full-size image; no hidden-image prefetch. */
export function showGallery({product,modal,esc,fa}){
 const images=[...new Set([product.image,...(product.images||[])].filter(url=>typeof url==='string'&&/^https:\/\//.test(url)))];
 if(!images.length){modal('<p>تصویری برای این محصول ثبت نشده است.</p>');return}
 modal(`<h2>تصاویر محصول</h2><p>${esc(product.title)}</p><div class="product-gallery"><div class="gallery-stage" id="galleryStage"></div><div class="gallery-controls"><button id="galleryPrevious" aria-label="تصویر قبلی">قبلی</button><span id="galleryPosition" role="status" aria-live="polite"></span><button id="galleryNext" aria-label="تصویر بعدی">بعدی</button></div></div>`);
 const $=s=>document.querySelector(s);let index=0;
 function paint(){
  const stage=$('#galleryStage');stage.replaceChildren();const loading=document.createElement('p');loading.textContent='در حال دریافت تصویر…';loading.setAttribute('role','status');stage.append(loading);const image=document.createElement('img');image.alt=product.title+' · تصویر '+fa(index+1);image.style.display='none';image.decoding='async';image.referrerPolicy='no-referrer';image.onload=()=>{if(stage.contains(image)){stage.removeAttribute('aria-busy');loading.remove();image.style.display='block'}};image.onerror=()=>{if(!stage.contains(image))return;stage.removeAttribute('aria-busy');stage.textContent='دریافت این تصویر ممکن نشد؛ تصویر بعدی را ببین.'};stage.setAttribute('aria-busy','true');image.src=images[index];stage.append(image);$('#galleryPosition').textContent=`تصویر ${fa(index+1)} از ${fa(images.length)}`;$('#galleryPrevious').disabled=index===0;$('#galleryNext').disabled=index===images.length-1;
 }
 $('#galleryPrevious').onclick=()=>{if(index>0){index--;paint()}};$('#galleryNext').onclick=()=>{if(index<images.length-1){index++;paint()}};paint();
}
