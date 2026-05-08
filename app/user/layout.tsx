import { cookies } from "next/headers";
import ImpersonationBanner from "@/components/ImpersonationBanner";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const impersonating = cookieStore.get("theouthaven_impersonate_user_id");

  return (
    <>
      {impersonating && <ImpersonationBanner />}
      <div className={impersonating ? "pt-10" : ""}>{children}</div>
    </>
  );
}