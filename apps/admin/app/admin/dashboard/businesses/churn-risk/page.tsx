import { redirect } from "next/navigation";

export default function LegacyBusinessChurnRiskPage() {
  redirect("/admin/dashboard/crm/operations?view=churn-risk");
}
