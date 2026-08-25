"use client";

import ReserveLayoutManager, {
  type ReserveLayoutManagerProps,
} from "@/components/reserve/ReserveLayoutManager";

export default function LocationLayoutClient(props: ReserveLayoutManagerProps) {
  return (
    <div className="reserve-command-center reserve-theme-dark">
      <ReserveLayoutManager {...props} />
    </div>
  );
}
