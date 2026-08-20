import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ScannerClient from "./ScannerClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrganizerEventScannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/organizers/dashboard/events/${id}/scanner`)}`);

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id,title,organization_id,source_kind")
    .eq("id", id)
    .maybeSingle();
  if (error || !event || event.source_kind !== "native" || !event.organization_id) notFound();

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("id")
    .eq("organization_id", event.organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/organizers/dashboard");

  return <ScannerClient eventId={event.id} eventTitle={event.title} organizationId={event.organization_id} />;
}
