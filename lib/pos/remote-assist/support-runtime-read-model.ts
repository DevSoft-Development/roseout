import type {SupportSessionRow,SupportAnnotation} from "./support-dashboard-model";
import type {DeviceDiagnostic} from "./device-diagnostics";
export interface AuthenticatedSupportReader{
 listAuthorizedSessions(technicianId:string):Promise<readonly SupportSessionRow[]>;
 listAuthorizedAnnotations(technicianId:string,sessionId:string):Promise<readonly SupportAnnotation[]>;
 getAuthorizedDeviceHealth(technicianId:string,deviceId:string):Promise<DeviceDiagnostic|null>;
}
export async function loadSupportDashboard(input:{
 technicianId:string;reader:AuthenticatedSupportReader;
}):Promise<{sessions:readonly SupportSessionRow[]}>{
 if(!input.technicianId)throw new Error("unauthenticated");
 return {sessions:await input.reader.listAuthorizedSessions(input.technicianId)};
}
