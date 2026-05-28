import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function UserEditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminRole(["superadmin", "admin"]);
  const params = await searchParams;
  const q = (params.q || "").trim();

  const query = supabaseAdmin.from("profiles").select("id,full_name,email,role,status", { count: "exact" }).order("created_at", { ascending: false }).limit(80);
  const { data, count } = q ? await query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`) : await query;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-white">
      <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
        <h1 className="text-3xl font-black">User Edit</h1>
        <p className="mt-2 text-sm text-white/65">Search and review user profiles. Safe profile fields only.</p>
        <form className="mt-4"><input name="q" defaultValue={q} placeholder="Search by name or email" className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2" /></form>
        <p className="mt-3 text-xs text-white/55">Total users: {count ?? data?.length ?? 0}</p>
        <div className="mt-4 space-y-2">
          {(data || []).map((u) => <Link key={u.id} href={`/admin/dashboard/users/${u.id}/edit`} className="block rounded-xl border border-white/10 px-3 py-2 hover:bg-white/5"><p className="font-semibold">{u.full_name || 'Unnamed user'}</p><p className="text-xs text-white/60">{u.email || 'No email'} · {u.role || 'member'} · {u.status || 'active'}</p></Link>)}
        </div>
      </div>
    </main>
  );
}
