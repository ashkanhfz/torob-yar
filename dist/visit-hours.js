const days=['sun','mon','tue','wed','thu','fri','sat'];
const minutes=t=>{const m=/^(\d{2}):(\d{2})/.exec(t||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:null};
export function visitStatus(shop,date=new Date(),margin=15){
 const stamp=+new Date(date);if(!Number.isFinite(stamp))return {open:null,remaining:null};
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).map(x=>[x.type,x.value]));
 const day=p.weekday.toLowerCase(),prev=days[(days.indexOf(day)+6)%7],now=+p.hour*60 + +p.minute;
 const today=shop?.weekly_hours?.[day],yesterday=shop?.weekly_hours?.[prev];let remaining=[];
 for(const [h,previous] of [[today,false],[yesterday,true]]){if(!h||h.status==='closed'||h.status==='unknown')continue;for(const shift of h.shifts||[]){const a=minutes(shift.start_time),b=minutes(shift.end_time);if(a===null||b===null||a===b)continue;if(previous){if(b<a&&now<b)remaining.push(b-now)}else if(now>=a&&(b<a||now<b))remaining.push((b<a?b+1440:b)-now)}}
 if(remaining.length){const left=Math.max(...remaining);return {open:true,remaining:left,enough:left>=margin}}
 const known=today&&today.status!=='unknown'&&(today.status==='closed'||today.shifts?.some(s=>minutes(s.start_time)!==null&&minutes(s.end_time)!==null&&s.start_time!==s.end_time));
 // An unknown previous shift could extend past midnight. Do not claim certainty then.
 const previousKnown=yesterday&&yesterday.status!=='unknown';
 return {open:known&&(now>=720||previousKnown)?false:null,remaining:null,enough:false};
}
export function kmBetween(a,b){if(![a?.lat,a?.lon,b?.lat,b?.lon].every(Number.isFinite))return null;const r=x=>x*Math.PI/180;return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lon-a.lon)/2)**2)))}
