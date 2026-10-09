import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function verifyPosManagerApproval(input: {
  locationId: string;
  staffProfileId: string;
  pin: string;
}) {
  const locationId = clean(input.locationId);
  const staffProfileId = clean(input.staffProfileId);
  const pin = clean(input.pin);
  if (!locationId || !staffProfileId || !/^\d{4,6}$/.test(pin)) {
    throw new Error("pos_manager_approval_required");
  }

  const { data: manager, error } = await supabaseAdmin
    .from("reserve_staff_profiles")
    .select("id,display_name,role,is_active")
    .eq("id", staffProfileId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (
    error ||
    !manager ||
    manager.is_active === false ||
    String(manager.role || "") !== "manager"
  ) {
    throw new Error("pos_manager_approval_required");
  }

  const verify = await supabaseAdmin.rpc("reserve_verify_staff_pin", {
    p_staff_profile_id: staffProfileId,
    p_pin: pin,
  });
  if (verify.error || verify.data !== true) {
    throw new Error("pos_manager_pin_invalid");
  }

  return {
    staffProfileId: String(manager.id),
    displayName: String(manager.display_name || "Manager"),
  };
}
