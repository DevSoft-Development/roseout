export type RelayGrantState={
 sessionState:"requested"|"approved"|"active"|"revoked"|"expired"|"ended";
 expiresAt:number;revokedAt:number|null;consentExpiresAt:number;
 verifiedTechnician:boolean;deviceAttested:boolean;
};
export function relayPermitted(grant:RelayGrantState,now:number):boolean{
 return grant.sessionState==="active"&&grant.revokedAt===null&&
 grant.expiresAt>now&&grant.consentExpiresAt>now&&
 grant.verifiedTechnician&&grant.deviceAttested;
}
export type RelayShutdown={
 closeViewerConnections(sessionId:string):Promise<void>;
 stopDevicePublisher(sessionId:string):Promise<void>;
 revokeTokens(sessionId:string):Promise<void>;
};
export async function shutdownRemoteAssist(sessionId:string,relay:RelayShutdown):Promise<void>{
 const results=await Promise.allSettled([
 relay.revokeTokens(sessionId),relay.closeViewerConnections(sessionId),
 relay.stopDevicePublisher(sessionId)]);
 if(results.some(r=>r.status==="rejected"))throw new Error("relay_shutdown_incomplete");
}
