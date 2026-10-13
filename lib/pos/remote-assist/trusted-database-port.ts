/** Trusted Remote Assist database port. Only the server-side identity layer may construct this. */
export type AssistDatabaseScope = {
 technicianId:string; locationId:string; deviceId:string; sessionId:string;
};
export type AssistDeviceScope = {
 locationId:string; deviceId:string; sessionId:string;
};
/** SQL functions have no public/service_role grants. Implementations must use
 * a dedicated least-privilege connection, with DB-side principal validation. */
export interface AssistPrivilegedDatabase {
 redeemCodeAndCreateProof(scope:AssistDatabaseScope,digest:string):Promise<"accepted"|"rejected"|"locked"|"expired">;
 activateWithProofs(scope:AssistDatabaseScope,expectedVersion:number):Promise<boolean>;
 recordCaptureAttestation(scope:AssistDeviceScope,attestationId:string,approvedAt:Date,expiresAt:Date):Promise<void>;
 revokeAndTerminate(scope:AssistDeviceScope,actorId:string,expectedVersion:number):Promise<void>;
}
export interface AssistAuthenticatedIdentity {
 resolveTechnician():Promise<{id:string;locationIds:readonly string[];deviceIds:readonly string[]}|null>;
 resolveDevice():Promise<{locationId:string;deviceId:string;sessionIds:readonly string[]}|null>;
}
/** Never accept identity, tenant scope, or capture permission from request JSON. */
export async function authorizedTechnicianScope(
 identity:AssistAuthenticatedIdentity,
 requested:AssistDeviceScope
):Promise<AssistDatabaseScope|null>{
 const user=await identity.resolveTechnician();
 if(!user||!user.locationIds.includes(requested.locationId)||!user.deviceIds.includes(requested.deviceId))return null;
 return {...requested,technicianId:user.id};
}
export async function authorizedDeviceScope(
 identity:AssistAuthenticatedIdentity,
 requested:AssistDeviceScope
):Promise<AssistDeviceScope|null>{
 const device=await identity.resolveDevice();
 if(!device||device.locationId!==requested.locationId||device.deviceId!==requested.deviceId||
 !device.sessionIds.includes(requested.sessionId))return null;
 return requested;
}
