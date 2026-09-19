import { redirect } from "next/navigation";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";
import { consumeAuthEmailToken } from "@/lib/auth/authEmailTokens";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const token = String(params.token || "");
  const consumed = await consumeAuthEmailToken({
    token,
    purpose: "signup_verify",
  });

  if (!consumed.valid) redirect("/auth/verified?status=invalid");

  const row = consumed.token;
  if (row.user_id) {
    await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
      email_confirm: true,
    });
  }
  const verifiedAt = new Date().toISOString();
  await Promise.all([
    supabaseAdmin
      .from("user_profiles")
      .update({ email_verified: true, email_verified_at: verifiedAt } as any)
      .eq("id", row.user_id),
    supabaseAdmin
      .from("users")
      .update({ email_verified: true, email_verified_at: verifiedAt } as any)
      .eq("id", row.user_id),
  ]);

  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const intendedPath = sanitizeIntendedPath(
    typeof metadata.next === "string" ? metadata.next : params.next,
  );
  const nextQuery = intendedPath
    ? `&next=${encodeURIComponent(intendedPath)}`
    : "";
  redirect(`/auth/verified?status=success${nextQuery}`);
}
