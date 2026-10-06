import type { PosCertifiedHardware } from "@/lib/pos/hardware/contracts";
import { POS_CERTIFIED_HARDWARE_DATA } from "@theouthaven/config/pos-hardware-catalog";

export const POS_CERTIFIED_HARDWARE =
  POS_CERTIFIED_HARDWARE_DATA as unknown as readonly PosCertifiedHardware[];

export function getCertifiedHardware(id: string) {
  return POS_CERTIFIED_HARDWARE.find((item) => item.id === id) || null;
}
