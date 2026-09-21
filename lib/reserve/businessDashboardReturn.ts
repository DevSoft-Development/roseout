import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getReserveAuthorizedDevice } from "@/lib/reserve/deviceAuthorization";
import { getReserveStaffSession } from "@/lib/reserve/staffSession";
import {
  ADMIN_DEMO_HANDOFF_COOKIE,
  verifyAdminDemoHandoff,
} from "@theouthaven/auth/admin-demo-handoff";
import {
  BUSINESS_RESERVE_HANDOFF_COOKIE,
  verifyBusinessReserveHandoff,
} from "@theouthaven/auth/business-reserve-handoff";

type ReturnIdentity = {
  allowed: boolean;
  userId?: string;
  email?: string | null;
  demoToken?: string;
  demoType?: "restaurant" | "activity";
};

async function hasDashboardAccess(input: {
  userId: string;
  email?: string | null;
  locationId: string;
}) {
  const access = await resolveLocationAccessContext({
    userId: input.userId,
    userEmail: input.email ?? null,
    locationId: input.locationId,
  });
  return hasLocationPermission(access, "location.view");
}

export async function resolveReserveBusinessDashboardReturn(
  locationId: string,
): Promise<ReturnIdentity> {
  const store = await cookies();

  const adminDemoToken = store.get(ADMIN_DEMO_HANDOFF_COOKIE)?.value;
  const adminDemo = verifyAdminDemoHandoff(adminDemoToken);
  if (adminDemo && String(adminDemo.locationId) === String(locationId)) {
    return {
      allowed: true,
      demoToken: adminDemoToken,
      demoType: adminDemo.type,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (
    user?.id &&
    (await hasDashboardAccess({
      userId: user.id,
      email: user.email ?? null,
      locationId,
    }))
  ) {
    return { allowed: true, userId: user.id, email: user.email ?? null };
  }

  const handoff = verifyBusinessReserveHandoff(
    store.get(BUSINESS_RESERVE_HANDOFF_COOKIE)?.value,
  );
  if (
    handoff &&
    String(handoff.locationId) === String(locationId) &&
    (await hasDashboardAccess({
      userId: handoff.userId,
      email: handoff.email,
      locationId,
    }))
  ) {
    return {
      allowed: true,
      userId: handoff.userId,
      email: handoff.email,
    };
  }

  const device = await getReserveAuthorizedDevice(locationId);
  const session = device ? await getReserveStaffSession(locationId) : null;
  const teamMemberId = session?.reserve_staff_profiles?.team_member_id;
  if (!device || !teamMemberId) return { allowed: false };

  const { data: member } = await supabaseAdmin
    .from("location_team_members")
    .select("user_id,email,invitation_status")
    .eq("id", teamMemberId)
    .eq("location_id", locationId)
    .in("invitation_status", ["accepted", "active"])
    .maybeSingle();

  if (
    member?.user_id &&
    (await hasDashboardAccess({
      userId: member.user_id,
      email: member.email,
      locationId,
    }))
  ) {
    return {
      allowed: true,
      userId: member.user_id,
      email: member.email,
    };
  }

  return { allowed: false };
}
