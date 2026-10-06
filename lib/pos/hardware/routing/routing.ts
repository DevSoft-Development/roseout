import type {
  PosHardwareAssignment,
  PosPrintJob,
  PosPrinterProvider,
  PosPrinterRole,
} from "@/lib/pos/hardware/contracts";

export type PosPrintRoute = {
  deviceId: string;
  role: PosPrinterRole;
  stationKey?: string | null;
  priority?: number;
};

export interface PosPrintRouteSource {
  list(locationId: string): Promise<readonly PosPrintRoute[]>;
}

export interface PosPrinterProviderResolver {
  resolve(deviceId: string): Promise<PosPrinterProvider>;
}

function normalizeRole(role: string): PosPrinterRole | null {
  const allowed: PosPrinterRole[] = [
    "receipt",
    "kitchen_hot_line",
    "kitchen_cold_line",
    "bar",
    "expo",
    "prep",
    "label",
  ];
  return allowed.includes(role as PosPrinterRole) ? (role as PosPrinterRole) : null;
}

export function routesFromAssignments(
  assignments: readonly (PosHardwareAssignment & { stationKey?: string | null })[],
): PosPrintRoute[] {
  return assignments
    .map((assignment) => {
      const role = normalizeRole(assignment.role);
      if (!role) return null;
      return {
        deviceId: assignment.deviceId,
        role,
        stationKey: assignment.stationKey || null,
      };
    })
    .filter(Boolean) as PosPrintRoute[];
}

export function selectPrintRoutes(
  routes: readonly PosPrintRoute[],
  role: PosPrinterRole,
): readonly PosPrintRoute[] {
  return routes
    .filter((route) => route.role === role)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));
}

export class RoleBasedPosPrinterRouter implements PosPrinterProvider {
  constructor(
    private readonly routeSource: PosPrintRouteSource,
    private readonly providerResolver: PosPrinterProviderResolver,
  ) {}

  async print(job: PosPrintJob) {
    const routes = selectPrintRoutes(
      await this.routeSource.list(job.locationId),
      job.printerRole,
    );

    if (!routes.length) {
      throw new Error(`pos_print_route_missing:${job.printerRole}`);
    }

    const failures: string[] = [];
    for (const route of routes) {
      try {
        const provider = await this.providerResolver.resolve(route.deviceId);
        await provider.print(job);
        return;
      } catch (error) {
        failures.push(
          `${route.deviceId}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    throw new Error(
      `pos_print_route_failed:${job.printerRole}:${failures.join("|")}`,
    );
  }
}
