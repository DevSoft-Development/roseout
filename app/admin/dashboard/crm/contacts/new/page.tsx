import Link from "next/link";
import CrmWorkspaceShell from "@/components/admin/crm/CrmWorkspaceShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createCrmContactAction } from "./actions";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/admin/dashboard/crm/") ? value : "/admin/dashboard/crm/contacts";
}

export default async function NewCrmContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(CRM_WRITE_ROLES);
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to);
  const phone = params.phone || "";

  return (
    <CrmWorkspaceShell>
      <main className="mx-auto max-w-3xl space-y-6 text-white">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-rose-300">CRM Contact</p>
          <h1 className="mt-1 text-3xl font-black">Create contact</h1>
          <p className="mt-2 text-sm text-white/55">Save the person behind this conversation. The phone number is carried over from the SMS thread.</p>
        </header>

        <form action={createCrmContactAction} className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <input type="hidden" name="return_to" value={returnTo} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold">
              <span>First name</span>
              <input name="first_name" autoFocus className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-rose-400" />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Last name</span>
              <input name="last_name" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-rose-400" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold">
              <span>Mobile phone</span>
              <input name="phone" defaultValue={phone} inputMode="tel" className="w-full rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] px-4 py-3 outline-none focus:border-emerald-300" />
              {phone ? <small className="block font-normal text-emerald-200/65">Prefilled from the SMS conversation.</small> : null}
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Email</span>
              <input name="email" type="email" className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-rose-400" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold">
              <span>Job title</span>
              <input name="job_title" placeholder="Owner, General Manager, Marketing Manager..." className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-rose-400" />
            </label>
            <label className="space-y-2 text-sm font-bold">
              <span>Department</span>
              <input name="department" placeholder="Ownership, Operations, Marketing..." className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-rose-400" />
            </label>
          </div>

          <label className="block space-y-2 text-sm font-bold">
            <span>Contact type</span>
            <select name="contact_type" defaultValue="business_contact" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-rose-400">
              <option value="business_contact">Business contact</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="decision_maker">Decision maker</option>
              <option value="operations">Operations</option>
              <option value="marketing">Marketing</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
            <button type="submit" className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-500">Create contact</button>
            <Link href={returnTo} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-black hover:bg-white/5">Cancel</Link>
          </div>
        </form>
      </main>
    </CrmWorkspaceShell>
  );
}
