import type {
  SearchRouteMatrixEntry,
  SearchRouteMatrixResult,
  SearchRoutePoint,
  SearchRoutingProvider,
} from "@/lib/search-framework";

export interface MapboxSearchRoutingProviderOptions {
  accessToken: string;
  endpoint?: string;
  timeoutMs?: number;
  maxCoordinatesPerRequest?: number;
  fetchImpl?: typeof fetch;
}

type MapboxMatrixResponse = {
  code?: string;
  message?: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
};

const METERS_PER_MILE = 1609.344;

export class MapboxSearchRoutingProvider implements SearchRoutingProvider {
  readonly providerId = "search-v3.mapbox-matrix.v1";

  private readonly accessToken: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxCoordinatesPerRequest: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MapboxSearchRoutingProviderOptions) {
    this.accessToken = options.accessToken.trim();
    if (!this.accessToken) throw new Error("mapbox_access_token_required");

    this.endpoint = (options.endpoint ?? "https://api.mapbox.com/directions-matrix/v1")
      .replace(/\/$/, "");
    this.timeoutMs = Math.max(500, Math.min(15_000, options.timeoutMs ?? 5_000));
    this.maxCoordinatesPerRequest = Math.max(
      2,
      Math.min(25, Math.floor(options.maxCoordinatesPerRequest ?? 25)),
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async routeMatrix(args: {
    mode: "walking" | "driving";
    origins: readonly SearchRoutePoint[];
    destinations: readonly SearchRoutePoint[];
  }): Promise<SearchRouteMatrixResult> {
    const origins = dedupePoints(args.origins);
    const destinations = dedupePoints(args.destinations);

    if (!origins.length || !destinations.length) {
      return {
        providerId: this.providerId,
        mode: args.mode,
        entries: [],
      };
    }

    const entries: SearchRouteMatrixEntry[] = [];
    const originChunkSize = Math.min(
      origins.length,
      Math.max(1, Math.floor(this.maxCoordinatesPerRequest / 2)),
    );

    for (const originChunk of chunks(origins, originChunkSize)) {
      const destinationChunkSize = Math.max(
        1,
        this.maxCoordinatesPerRequest - originChunk.length,
      );

      for (const destinationChunk of chunks(destinations, destinationChunkSize)) {
        entries.push(...await this.requestMatrix({
          mode: args.mode,
          origins: originChunk,
          destinations: destinationChunk,
        }));
      }
    }

    return {
      providerId: this.providerId,
      mode: args.mode,
      entries,
    };
  }

  private async requestMatrix(args: {
    mode: "walking" | "driving";
    origins: readonly SearchRoutePoint[];
    destinations: readonly SearchRoutePoint[];
  }): Promise<SearchRouteMatrixEntry[]> {
    const profile = args.mode === "walking" ? "mapbox/walking" : "mapbox/driving";
    const points = [...args.origins, ...args.destinations];
    if (points.length > this.maxCoordinatesPerRequest) {
      throw new Error("mapbox_matrix_coordinate_limit_exceeded");
    }

    for (const point of points) validatePoint(point);

    const coordinates = points
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(";");
    const sources = args.origins.map((_, index) => String(index)).join(";");
    const destinations = args.destinations
      .map((_, index) => String(args.origins.length + index))
      .join(";");

    const query = new URLSearchParams({
      annotations: "distance,duration",
      sources,
      destinations,
      access_token: this.accessToken,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        `${this.endpoint}/${profile}/${coordinates}?${query.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            accept: "application/json",
          },
        },
      );

      const data = await response.json().catch(() => null) as MapboxMatrixResponse | null;

      if (!response.ok) {
        throw new Error(`mapbox_matrix_http_${response.status}`);
      }

      if (!data || data.code !== "Ok") {
        throw new Error("mapbox_matrix_invalid_response");
      }

      const durations = data.durations ?? [];
      const distances = data.distances ?? [];

      return args.origins.flatMap((origin, originIndex) =>
        args.destinations.map((destination, destinationIndex) => {
          const durationSeconds = durations[originIndex]?.[destinationIndex] ?? null;
          const distanceMeters = distances[originIndex]?.[destinationIndex] ?? null;
          const reachable =
            durationSeconds != null &&
            distanceMeters != null &&
            Number.isFinite(durationSeconds) &&
            Number.isFinite(distanceMeters);

          return {
            originId: origin.id,
            destinationId: destination.id,
            distanceMiles: reachable ? distanceMeters / METERS_PER_MILE : null,
            durationMinutes: reachable ? durationSeconds / 60 : null,
            source: "mapbox",
            confidence: reachable ? "verified" : "unknown",
          } satisfies SearchRouteMatrixEntry;
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("mapbox_matrix_timeout");
      }
      if (
        error instanceof Error &&
        error.message.startsWith("mapbox_matrix_")
      ) {
        throw error;
      }
      throw new Error("mapbox_matrix_request_failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createMapboxSearchRoutingProviderFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): MapboxSearchRoutingProvider | null {
  const accessToken = String(env.MAPBOX_ACCESS_TOKEN ?? "").trim();
  return accessToken
    ? new MapboxSearchRoutingProvider({ accessToken })
    : null;
}

function dedupePoints(points: readonly SearchRoutePoint[]): SearchRoutePoint[] {
  const byId = new Map<string, SearchRoutePoint>();
  for (const point of points) {
    if (!byId.has(point.id)) byId.set(point.id, point);
  }
  return [...byId.values()];
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

function validatePoint(point: SearchRoutePoint) {
  if (
    !point.id ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new Error("mapbox_matrix_invalid_coordinate");
  }
}
