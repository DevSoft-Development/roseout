import Link from "next/link";
import { notFound } from "next/navigation";
import SupportTicketConversation from "@/components/support/SupportTicketConversation";
import { getSupportTicket, getSupportTicketMessages } from "@/lib/support";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
};

export default async function PublicSupportTicketPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { key = "" } = await searchParams;
  const ticket = await getSupportTicket(id);

  if (!ticket || key !== ticket.public_access_token) {
    notFound();
  }

  const messages = await getSupportTicketMessages(ticket.id);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/support" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
            ← Support home
          </Link>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">
            Private ticket link
          </p>
        </div>
        <SupportTicketConversation ticket={ticket} messages={messages} accessKey={key} />
      </div>
    </main>
  );
}
