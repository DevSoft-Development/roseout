import "server-only";

export {
  getLocationOwnerAccess,
  hasOwnerAccessToLocation,
  requireOwnerAccessToLocation,
  requireOwnerOrAdminAccessToLocation,
  resolveEditableLocationContext,
  type EditableLocationContext,
  type EditableLocationContextInput,
  type OwnerAccess,
  type OwnerLocationAccessResult,
} from "@/lib/auth/locationOwnerAccess";
