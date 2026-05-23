export function haversineMiles(lat1:number,lng1:number,lat2:number,lng2:number){
  const toRad=(d:number)=>(d*Math.PI)/180;
  const R=3958.8;
  const dLat=toRad(lat2-lat1);
  const dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export function walkingMinutesFromMiles(miles:number){
  return Math.max(1, Math.round(miles*20));
}
