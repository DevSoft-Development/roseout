"use client";

import ReserveLayoutManager, {
  type ReserveLayoutManagerProps,
} from "@/components/reserve/ReserveLayoutManager";

export default function LocationLayoutClient(props: ReserveLayoutManagerProps) {
  return <ReserveLayoutManager {...props} />;
}
