import SupportTicketClient from "@/components/support/SupportTicketClient";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Support Center",
  description:
    "Contact TheOutHaven support, submit a ticket, and get help with accounts, listings, reservations, or outing plans.",
  path: "/support",
  noIndex: true,
});
export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            TheOutHaven Support
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
            Submit, view, and reply to support tickets
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
            Create a ticket for account, reservation, owner, listing, billing,
            or general TheOutHaven help. We send email and text updates to you
            and the TheOutHaven admin team.
          </p>
        </section>

        <SupportTicketClient />
      </div>
    </main>
  );
}
