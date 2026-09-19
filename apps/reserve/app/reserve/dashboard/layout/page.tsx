import { redirect } from "next/navigation";

export default function ReserveLocationLayoutRedirectPage() {
  redirect("/reserve/dashboard?tab=settings&section=layout");
}
