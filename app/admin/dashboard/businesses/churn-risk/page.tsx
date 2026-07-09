import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function LegacyBusinessChurnRiskPage() {
  redirect(`${ROUTES.adminCrm}/operations?view=churn-risk`);
}
