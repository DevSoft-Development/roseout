import type { AdminRole } from "@/lib/users/roles";

type AuthIdentity = {
  provider?: string | null;
};

type AuthUserIdentityShape = {
  app_metadata?: Record<string, unknown> | null;
  identities?: AuthIdentity[] | null;
};

export function isMicrosoftAdminIdentity(user: AuthUserIdentityShape) {
  if (user.app_metadata?.provider === "azure") return true;
  return Boolean(user.identities?.some((identity) => identity.provider === "azure"));
}

export function canUseEmergencyAdminSignIn(role: AdminRole) {
  return role === "superadmin";
}

export function adminIdentitySatisfiesPolicy(role: AdminRole, user: AuthUserIdentityShape) {
  return canUseEmergencyAdminSignIn(role) || isMicrosoftAdminIdentity(user);
}
