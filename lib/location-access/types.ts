export type LocationPermission =
  | "menu.view"
  | "menu.edit"
  | "marketing.view"
  | "marketing.edit"
  | "recommendations.view"
  | "recommendations.apply"
  | "photos.view"
  | "photos.upload"
  | "location.view"
  | "location.edit";

export type LocationAccessSource =
  | "owner"
  | "admin"
  | "superadmin"
  | "demo"
  | "location_admin"
  | "view_only"
  | "public"
  | "none";

export type LocationAccessContext = {
  userId: string | null;
  userEmail?: string | null;
  locationId: string;
  locationType?: "restaurant" | "activity" | "location" | "unknown";
  location?: Record<string, unknown> | null;
  isAuthenticated: boolean;
  isSuperadmin: boolean;
  isAdmin: boolean;
  isDemoLocation: boolean;
  isDemoPreview: boolean;
  isOwner: boolean;
  isLocationAdmin: boolean;
  isViewOnly: boolean;
  canView: boolean;
  canEdit: boolean;
  permissions: LocationPermission[];
  source: LocationAccessSource;
};

export type ResolveLocationAccessOptions = {
  locationId?: string | null;
  adminLocationId?: string | null;
  demoLocationId?: string | null;
  sourceId?: string | null;
  locationType?: string | null;
  type?: string | null;
  request?: Request;
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined> | null;
  body?: Record<string, unknown> | null;
  requiredPermission?: LocationPermission;
  allowDemoPreview?: boolean;
};
