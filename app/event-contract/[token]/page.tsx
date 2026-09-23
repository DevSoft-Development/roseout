import { EventContractPage } from "@/components/growth-pro/EventContractPage";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const payment = Array.isArray(query.payment) ? query.payment[0] : query.payment;
  return <EventContractPage token={token} payment={payment || null} />;
}
