const norm=s=>String(s||'').toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s\-_/،]+/g,' ').trim();
export function rankRows(rows,query){
 const q=norm(query),terms=q.split(' ').filter(Boolean);
 function score(r){const title=norm(r[1]),cat=norm(r[2]);let s=terms.filter(t=>title.includes(t)).length*4+terms.filter(t=>cat.includes(t)).length*3;
  if(title.includes(q))s+=5;
  if(/گوشی|موبایل/.test(q)&&!/قاب|کاور|باتری|گلس|شارژر|فلت|لنز|قطعه|درب|هولدر|محافظ/.test(q)&&cat==='گوشی موبایل')s+=100;
  if(/کفش|کتانی|کتونی/.test(q)&&!/کاور|جاکفشی|واکس/.test(q)&&(/^(کفش|کتانی)/.test(cat)))s+=70;
  if(/لپ|laptop/.test(q)&&!/کیف|باتری|شارژر|پایه|رم/.test(q)&&/^لپ/.test(cat))s+=70;
  if(terms.every(t=>cat.includes(t)))s+=10;
  return s;
 }
 return rows.map(r=>[r,score(r)]).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
}
