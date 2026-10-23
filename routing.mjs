// Coordinates are supplied by the client; the upstream host is deployment configuration only.
export function createRouting({baseURL=process.env.OSRM_BASE_URL,fetcher=fetch}={}) {
  return async function route(points) {
    const fail=(status,error)=>({status,body:{error}});
    if(!Array.isArray(points)||points.length<2||points.length>6||points.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))return fail(400,'invalid_route_points');
    if(!baseURL)return fail(503,'routing_not_configured');
    try {
      const url=new URL(baseURL);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return fail(503,'routing_not_configured');
      url.pathname='/route/v1/driving/'+points.map(p=>`${p.lon},${p.lat}`).join(';');
      url.search=new URLSearchParams({steps:'true',geometries:'geojson',overview:'full',alternatives:'false',radiuses:points.map(()=>'200').join(';')}).toString();
      const response=await fetcher(url,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)return fail(502,'routing_unavailable');
      const data=await response.json(),r=data.routes?.[0];
      if(['NoRoute','NoSegment'].includes(data.code))return fail(422,'route_not_found');
      if(data.code!=='Ok'||!r||!Number.isFinite(r.distance)||!Number.isFinite(r.duration)||r.geometry?.type!=='LineString'||!Array.isArray(r.geometry.coordinates)||!Array.isArray(r.legs))return fail(502,'routing_invalid_response');
      return {status:200,body:{engine:'OSRM',profile:'driving',traffic:false,distance:r.distance,duration:r.duration,geometry:r.geometry,legs:r.legs.map(leg=>({distance:leg.distance,duration:leg.duration,steps:(leg.steps||[]).map(s=>({distance:s.distance,duration:s.duration,name:String(s.name||'').slice(0,200),maneuver:s.maneuver}))})),waypoints:(data.waypoints||[]).map(p=>({location:p.location,distance:p.distance,name:p.name}))}};
    }catch{return fail(502,'routing_unavailable')}
  };
}
