import { requireAdminRole } from "@/lib/admin-auth";
import { EMAIL_TEMPLATE_GROUPS, getEmailTemplate } from "@/lib/email/registry";
import { resolveEmailSender } from "@/lib/email/brand";

export const metadata = { title: "Email Templates – Admin" };

export default async function Page() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  return (
    <main className="min-h-screen bg-[#090706] px-6 py-8 text-[#fff7f2]">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[2rem] border border-white/10 bg-[#141010] p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">TheOutHaven Admin</p>
          <h1 className="mt-3 text-4xl font-black">Email template registry</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#b8aaa3]">All transactional, operational, reservation, support, digest, and marketing emails now render through one branded TheOutHaven system.</p>
        </section>
        {Object.entries(EMAIL_TEMPLATE_GROUPS).map(([category, keys]) => (
          <section key={category} className="rounded-[1.75rem] border border-white/10 bg-[#141010] p-6">
            <h2 className="text-2xl font-black capitalize">{category}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {keys.map((key) => {
                const rendered = getEmailTemplate(key, { firstName: "Avery", locationName: "Rose Room", reservationDate: "Tonight", reservationTime: "7:30 PM", partySize: 2, confirmationCode: "TOH-2026", ctaUrl: "https://theouthaven.com" });
                const sender = resolveEmailSender(rendered.department);
                return (
                  <article key={key} className="rounded-2xl border border-white/10 bg-[#1c1614] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-[#e1062a]">{key}</p>
                        <h3 className="mt-2 text-lg font-black">{rendered.subject}</h3>
                      </div>
                      <span className="rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1 text-xs font-bold text-[#fff7f2]">Active</span>
                    </div>
                    <dl className="mt-4 space-y-2 text-sm text-[#b8aaa3]">
                      <div><dt className="font-bold text-[#8f817a]">Category</dt><dd className="capitalize">{category}</dd></div>
                      <div><dt className="font-bold text-[#8f817a]">Department</dt><dd>{rendered.department}</dd></div>
                      <div><dt className="font-bold text-[#8f817a]">From</dt><dd>{sender.from}</dd></div>
                      <div><dt className="font-bold text-[#8f817a]">Reply-to</dt><dd>{sender.replyTo}</dd></div>
                      <div><dt className="font-bold text-[#8f817a]">Preview</dt><dd>{rendered.preview}</dd></div>
                      <div><dt className="font-bold text-[#8f817a]">Recipient</dt><dd>{rendered.recipientType || "user"}</dd></div>
                    </dl>
                    <details className="mt-4 rounded-xl border border-white/10 bg-[#090706] p-3">
                      <summary className="cursor-pointer text-sm font-bold text-[#fff7f2]">Preview text fallback</summary>
                      <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-[#b8aaa3]">{rendered.text}</pre>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
