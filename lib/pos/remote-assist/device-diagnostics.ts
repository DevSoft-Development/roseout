export type Health="healthy"|"degraded"|"offline"|"unknown";
export type DeviceDiagnostic={
 deviceId:string;observedAt:number;
 network:Health;printer:Health;hub:Health;offlineQueue:Health;
 printerLastSeenAt:number|null;hubLastSeenAt:number|null;
};
export function diagnosticWarnings(d:DeviceDiagnostic,now:number):string[]{
 const warnings:string[]=[];
 for(const key of ["network","printer","hub","offlineQueue"] as const){
 if(d[key]!=="healthy")warnings.push(key+":"+d[key]);
 }
 if(d.printerLastSeenAt!==null&&now-d.printerLastSeenAt>60_000)warnings.push("printer:stale");
 if(d.hubLastSeenAt!==null&&now-d.hubLastSeenAt>60_000)warnings.push("hub:stale");
 return warnings;
}
export const DIAGNOSTICS_READ_ONLY=true as const;
