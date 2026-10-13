export type SupportSessionRow={
 sessionId:string;locationId:string;deviceId:string;
 state:"requested"|"approved"|"active"|"revoked"|"expired"|"ended";
 requestedAt:string;expiresAt:string|null;technicianId:string;
};
export type SupportAnnotation={
 sessionId:string;actorId:string;at:string;
 kind:"pointer"|"highlight"|"drawing";payload:Readonly<Record<string,unknown>>;
};
export function canAnnotate(row:SupportSessionRow,technicianId:string,now:Date):boolean{
 return row.state==="active"&&row.technicianId===technicianId&&
 row.expiresAt!==null&&new Date(row.expiresAt).getTime()>now.getTime();
}
/** The support dashboard is strictly view/annotation only. */
export const REMOTE_INPUT_ENABLED=false as const;
