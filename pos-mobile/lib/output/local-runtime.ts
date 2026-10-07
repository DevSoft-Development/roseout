import { fetchPosOutputConfig } from "@/lib/device/cloud";
import type { PosClaimSession } from "@/lib/device/identity";
import { getThePosHavenHardwareBridge } from "@/lib/hardware/native-bridge";
import { savePosOutputRoutes, securePosOutputRouteSource } from "@/lib/output/route-store";
import { RoleBasedPosOutputRouter, type PosLocalEndpointResolver, type PosOutputRole } from "@/lib/output/routing";

const VALID_ROLES=new Set<PosOutputRole>([
  "receipt","kitchen_hot_line","kitchen_cold_line","bar","expo","prep","label","cash_drawer",
]);

function norm(value: unknown) {
  return String(value||"").trim().toLowerCase();
}

function discoveredMatches(route:any,device:any) {
  const serial=norm(route.serialNumber);
  const providerId=norm(route.providerDeviceId);
  const discoveredSerial=norm(device.serialNumber);
  const discoveredProviderId=norm(device.providerDeviceId);
  if(providerId&&discoveredProviderId&&providerId===discoveredProviderId) return true;
  if(serial&&discoveredSerial&&serial===discoveredSerial) return true;
  return false;
}

export async function createSyncedPosOutputRouter(session:PosClaimSession) {
  const config=await fetchPosOutputConfig({
    deviceId:session.deviceId,
    credential:session.credential,
  });
  const routes=config.routes
    .filter(route=>VALID_ROLES.has(route.role as PosOutputRole))
    .map(route=>({
      role:route.role as PosOutputRole,
      deviceId:route.deviceId,
      priority:Number(route.priority||0),
    }));

  await savePosOutputRoutes({
    revision:config.revision||new Date().toISOString(),
    locationId:session.locationId,
    routes,
  });

  const discovered=await getThePosHavenHardwareBridge().scanLocalDevices(3500);
  const endpoints=new Map<string,{host:string;port?:number}>();
  for(const route of config.routes){
    const match=discovered.find(device=>discoveredMatches(route,device));
    if(match?.host){
      endpoints.set(route.deviceId,{host:String(match.host),port:Number(match.port||9100)});
    }
  }

  const resolver:PosLocalEndpointResolver={
    async resolve(deviceId:string){
      const endpoint=endpoints.get(deviceId);
      if(!endpoint) throw new Error(`pos_output_endpoint_unresolved:${deviceId}`);
      return endpoint;
    },
  };

  return {
    router:new RoleBasedPosOutputRouter(securePosOutputRouteSource,resolver),
    discoveredCount:discovered.length,
    resolvedCount:endpoints.size,
    routeCount:routes.length,
  };
}
