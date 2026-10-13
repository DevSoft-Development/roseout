import {certifiedForRollout,type CaptureCertification} from "./native-capture-certification";
import {relayPermitted,type RelayGrantState} from "./relay-revocation-policy";
import {diagnosticWarnings,type DeviceDiagnostic} from "./device-diagnostics";
import {canAnnotate,type SupportSessionRow} from "./support-dashboard-model";

export type SupportCertificationEvidence={
 android:CaptureCertification;ipados:CaptureCertification;linux:CaptureCertification;
 relay:RelayGrantState;diagnostics:DeviceDiagnostic;
 dashboard:SupportSessionRow;technicianId:string;
 deviceApprovalObserved:boolean;codeRedemptionObserved:boolean;
 revocationDisconnectedPublisher:boolean;revocationDisconnectedViewers:boolean;
 noRemoteControlObserved:boolean;
};
export type SupportCertificationResult={passed:boolean;failures:string[]};
/** Only verified runtime evidence may be supplied by a certification runner. */
export function evaluateSupportCertification(e:SupportCertificationEvidence,now:number):SupportCertificationResult{
 const failures:string[]=[];
 for(const platform of ["android","ipados","linux"] as const){
  if(e[platform].platform!==platform||!certifiedForRollout(e[platform]))failures.push(platform+":native_capture_uncertified");
 }
 if(!e.deviceApprovalObserved)failures.push("device_approval_missing");
 if(!e.codeRedemptionObserved)failures.push("code_redemption_missing");
 if(!relayPermitted(e.relay,now))failures.push("relay_not_authorized");
 if(!canAnnotate(e.dashboard,e.technicianId,new Date(now)))failures.push("annotation_session_not_authorized");
 if(!e.revocationDisconnectedPublisher)failures.push("publisher_revocation_failed");
 if(!e.revocationDisconnectedViewers)failures.push("viewer_revocation_failed");
 if(!e.noRemoteControlObserved)failures.push("remote_control_prohibition_unverified");
 if(diagnosticWarnings(e.diagnostics,now).length)failures.push("diagnostics_unhealthy");
 return {passed:failures.length===0,failures};
}
