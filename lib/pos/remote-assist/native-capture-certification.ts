export type CapturePlatform="android"|"ipados"|"linux";
export type CaptureCertification={
 platform:CapturePlatform; nativeConsent:boolean; deviceAuthenticated:boolean;
 sessionBound:boolean; revocationStopsCapture:boolean; noRemoteInput:boolean;
 captureTransportEncrypted:boolean; testedOnPhysicalDevice:boolean;
};
export function certifiedForRollout(c:CaptureCertification):boolean{
 return c.nativeConsent&&c.deviceAuthenticated&&c.sessionBound&&
 c.revocationStopsCapture&&c.noRemoteInput&&c.captureTransportEncrypted&&c.testedOnPhysicalDevice;
}
export function requiredNativeCaptureAdapter(platform:CapturePlatform):string{
 switch(platform){
 case "android":return "MediaProjection";
 case "ipados":return "ReplayKit Broadcast Upload";
 case "linux":return "xdg-desktop-portal ScreenCast (controlled X11 fallback)";
 }
}
