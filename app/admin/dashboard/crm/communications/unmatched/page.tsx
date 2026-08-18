import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function formatWhen(value: string | null) {
  if (!value) return "No timestamp";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function phoneFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "Unknown number";
  return String((metadata as Record<string, unknown>).inbound_phone || "Unknown number");
}

export default async function UnmatchedCrmSmsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(CRM_READ_ROLES);
  const params = await searchParams;

  const { data: conversations, error } = await supabaseAdmin
    .from("crm_conversations")
    .select("id,conversation_key,status,priority,last_message_at,last_inbound_at,is_unread,unread_count,metadata,created_at")
    .eq("channel", "sms")
    .contains("metadata", { routing_status: "unmatched" })
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) throw error;

  const rows = conversations || [];
  const selectedId = rows.some((row) => row.id === params.conversation)
    ? params.conversation
    : rows[0]?.id;

  const { data: messages, error: messageError } = selectedId
    ? await supabaseAdmin
        .from("crm_messages")
        .select("id,direction,message_type,body_text,status,created_at,metadata")
        .eq("conversation_id", selectedId)
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [], error: null };

  if (messageError) throw messageError;

  const selected = rows.find((row) => row.id === selectedId) || null;
  const selectedPhone = selected ? phoneFromMetadata(selected.metadata) : null;
  const unreadCount = rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0);

  return (
    <CrmWorkspaceShell>
      <main className="space-y-5 text-white">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-rose-300">CRM Communications</p>
            <h1 className="text-3xl font-black">Unmatched CRM Inbox</h1>
            <p className="mt-1 text-white/60">Every SMS to 516-200-0811 that cannot be tied to a saved CRM contact lands here.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/dashboard/crm/notifications" className="rounded-xl border border-white/15 px-4 py-2 font-bold hover:bg-white/5">Notifications</Link>
            <Link href="/admin/dashboard/crm/contacts" className="rounded-xl bg-white px-4 py-2 font-black text-black">CRM contacts</Link>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><b className="text-2xl">{rows.length}</b><small className="mt-1 block text-white/50">Unmatched threads</small></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><b className="text-2xl">{unreadCount}</b><small className="mt-1 block text-white/50">Unread messages</small></div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"><b className="text-sm text-amber-100">Match before replying</b><small className="mt-1 block text-amber-100/60">Unknown senders are preserved but never silently attached to a location.</small></div>
        </section>

        <section className="grid min-h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-black/20 lg:grid-cols-[360px_1fr]">
          <aside className="border-b border-white/10 lg:border-b-0 lg:border-r">
            {rows.length ? rows.map((row) => {
              const phone = phoneFromMetadata(row.metadata);
              const active = row.id === selectedId;
              return (
                <Link
                  key={row.id}
                  href={`?conversation=${row.id}`}
                  className={`block border-b border-white/10 p-4 transition ${active ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <b>{phone}</b>
                    {row.unread_count ? <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-black">{row.unread_count}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-white/45">{formatWhen(row.last_inbound_at || row.last_message_at || row.created_at)}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-200/70">Unmatched · {row.status.replaceAll("_", " ")}</p>
                </Link>
              );
            }) : <p className="p-8 text-sm text-white/55">No unmatched SMS threads.</p>}
          </aside>

          <div className="flex min-w-0 flex-col">
            {selected ? (
              <>
                <div className="border-b border-white/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black">{selectedPhone}</h2>
                      <p className="text-sm text-white/50">Not linked to a CRM contact or location.</p>
                    </div>
                    <Link
                      href={`/admin/dashboard/crm/contacts?phone=${encodeURIComponent(selectedPhone || "")}`}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black"
                    >
                      Find or add contact
                    </Link>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {(messages || []).map((message) => (
                    <div key={message.id} className="max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                        <b className="uppercase tracking-wide text-white/70">{message.direction}</b>
                        <span>{message.message_type}</span>
                        <span>{formatWhen(message.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-white/85">{message.body_text || "(No text body)"}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 bg-amber-300/[0.05] p-4 text-sm text-amber-100/75">
                  Reply is intentionally disabled until this number is matched to a CRM contact. This prevents accidental outreach to an unidentified sender while preserving every inbound message.
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-12 text-center text-white/55">Select an unmatched conversation.</div>
            )}
          </div>
        </section>
      </main>
    </CrmWorkspaceShell>
  );
}
