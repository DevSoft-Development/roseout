import { redirect } from "next/navigation";

type PlanByIdPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlanByIdPage({ params, searchParams }: PlanByIdPageProps) {
  const { id } = await params;
  const query = new URLSearchParams();
  query.set("planId", id);

  const resolvedSearchParams = searchParams ? await searchParams : {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }

  redirect(`/plan?${query.toString()}`);
}
