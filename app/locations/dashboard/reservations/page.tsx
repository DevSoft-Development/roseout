import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";

export const dynamic = "force-dynamic";

export default function LocationWorkspaceReservationsPage() {
  return (
    <div className="location-workspace-reserve min-w-0 bg-[#050607] text-white">
      <ReserveCommandCenterPage />
    </div>
  );
}
