// Route estimates + recorded Tehran opening hours. Never a live opening/stock check.
const weekdays=['sun','mon','tue','wed','thu','fri','sat'];
const localClock=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const DEFAULT_VISIT_MINUTES=15;
export const MAX_VISIT_MINUTES=180;

function timestamp(value){
  // The app's datetime-local picker explicitly means Tehran, not the browser zone.
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value))value+='+03:30';
  if(!(value instanceof Date)&&typeof value!=='string'&&typeof value!=='number')return null;
  const stamp=+new Date(value);
  return Number.isFinite(stamp)?stamp:null;
}

function clockSeconds(value,end=false){
  const match=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value||'');
  if(!match)return null;
  const [hour,minute,second]=match.slice(1).map(x=>Number(x||0));
  if(minute>59||second>59||hour>23&&!(end&&hour===24&&minute===0&&second===0))return null;
  return hour*3600+minute*60+second;
}

function daySchedule(day,offset){
  if(!day||!['declared','open','closed'].includes(day.status))return {known:false,intervals:[]};
  if(day.status==='closed')return {known:true,intervals:[]};
  const intervals=[];let malformed=false;
  for(const shift of Array.isArray(day.shifts)?day.shifts:[]){
    const start=clockSeconds(shift?.start_time),end=clockSeconds(shift?.end_time,true);
    if(start===null||end===null){malformed=true;continue}
    // Equal endpoints in this dataset are empty placeholder shifts, not 24/7.
    if(start===end)continue;
    intervals.push([offset*86400+start,offset*86400+end+(end<start?86400:0)]);
  }
  return {known:intervals.length>0&&!malformed,intervals};
}

function openingAt(shop,arrival,visitMinutes){
  const parts=Object.fromEntries(localClock.formatToParts(arrival).map(p=>[p.type,p.value]));
  const day=weekdays.indexOf(parts.weekday.toLowerCase());
  const now=Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second)+arrival.getUTCMilliseconds()/1000;
  const schedules=[-1,0,1].map(offset=>daySchedule(shop?.weekly_hours?.[weekdays[(day+offset+7)%7]],offset));
  const intervals=schedules.flatMap(s=>s.intervals).sort((a,b)=>a[0]-b[0]),merged=[];
  for(const interval of intervals){
    const previous=merged.at(-1);
    if(previous&&interval[0]<=previous[1])previous[1]=Math.max(previous[1],interval[1]);
    else merged.push([...interval]);
  }
  const active=merged.find(([start,end])=>start<=now&&now<end);
  if(active){
    const remainingMinutes=(active[1]-now)/60;
    return {status:remainingMinutes>=visitMinutes?'open':'too-short',remainingMinutes,closing:new Date(+arrival+remainingMinutes*60000),reason:remainingMinutes>=visitMinutes?'schedule_open':'schedule_closing_soon'};
  }
  // An unknown preceding day might contain an overnight shift. Keep uncertainty.
  return {status:schedules[0].known&&schedules[1].known?'closed':'unknown',remainingMinutes:null,closing:null,reason:schedules[0].known&&schedules[1].known?'schedule_closed':'hours_unknown'};
}

/**
 * One result per destination in the same order as OSRM legs.
 * `arrival` and `departure` are Date objects; departure includes the planned visit.
 * Visit time is counted at every planned stop, including a closed/unknown stop;
 * this calculator never silently drops destinations or invents a missing leg.
 */
export function planArrival({shops=[],departure=new Date(),legs=[],visitMinutes=DEFAULT_VISIT_MINUTES}={}){
  let cursor=timestamp(departure);
  const validVisit=Number.isFinite(visitMinutes)&&visitMinutes>=1&&visitMinutes<=MAX_VISIT_MINUTES;
  return (Array.isArray(shops)?shops:[]).map((shop,index)=>{
    const duration=Array.isArray(legs)?legs[index]?.duration:null;
    const validDuration=Number.isFinite(duration)&&duration>=0;
    const stamp=cursor!==null&&validDuration?timestamp(cursor+duration*1000):null;
    const arrival=stamp===null?null:new Date(stamp);
    const finish=stamp!==null&&validVisit?timestamp(stamp+visitMinutes*60000):null;
    const status=arrival&&validVisit?openingAt(shop,arrival,visitMinutes):{status:'unknown',remainingMinutes:null,closing:null,reason:!validVisit?'visit_duration_invalid':!validDuration?'route_duration_unknown':'departure_unknown'};
    cursor=finish;
    return {...status,arrival,departure:finish===null?null:new Date(finish),visitMinutes,travelSeconds:validDuration?duration:null};
  });
}
