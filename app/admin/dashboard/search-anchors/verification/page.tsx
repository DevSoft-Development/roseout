import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function SearchAnchorVerificationPage() {
  const [searchable, linked, activeLinked, pending, failed, deadLetter, discoveries, ambiguous] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", true),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null).eq("is_active", true).eq("is_searchable", true),
    supabaseAdmin.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("search_anchor_reconciliation_queue").select("id", { count: "exact", head: true }).eq("status", "failed"