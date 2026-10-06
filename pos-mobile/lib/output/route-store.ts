import * as SecureStore from "expo-secure-store";
import type {
  PosOutputRoute,
  PosOutputRouteSource,
} from "@/lib/output/routing";

const ROUTES_KEY = "theposhaven.output_routes";

type StoredRouteSnapshot = {
  revision: string;
  locationId: string;
  routes: PosOutputRoute[];
};

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`pos_routes_missing_${field}`);
  return normalized;
}

export async function savePosOutputRoutes(snapshot: StoredRouteSnapshot) {
  const normalized: StoredRouteSnapshot = {
    revision: required(snapshot.revision, "revision"),
    locationId: required(snapshot.locationId, "location_id"),
    routes: snapshot.routes.map((route) => ({
      role: route.role,
      deviceId: required(route.deviceId, "device_id"),
      priority: Number.isFinite(route.priority) ? Number(route.priority) : 0,
    })),
  };

  await SecureStore.setItemAsync(ROUTES_KEY, JSON.stringify(normalized), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getPosOutputRouteSnapshot() {
  const raw = await SecureStore.getItemAsync(ROUTES_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredRouteSnapshot;
  } catch {
    await SecureStore.deleteItemAsync(ROUTES_KEY);
    return null;
  }
}

export const securePosOutputRouteSource: PosOutputRouteSource = {
  async list() {
    const snapshot = await getPosOutputRouteSnapshot();
    return snapshot?.routes || [];
  },
};
