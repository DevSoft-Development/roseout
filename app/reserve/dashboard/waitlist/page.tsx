import { redirect } from "next/navigation";

export default function RedirectToReserveCommandCenter() {
  redirect("/reserve/dashboard/reservations?tab=waitlist");
}
