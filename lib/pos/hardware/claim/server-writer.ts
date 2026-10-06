import { assignPosHardwareDevice } from "@/lib/pos/hardware/device-registry";
import type { PosHardwareClaimWriter } from "@/lib/pos/hardware/claim/claim";

export const posHardwareClaimWriter: PosHardwareClaimWriter = {
  async assign(input) {
    return assignPosHardwareDevice(input);
  },
};
