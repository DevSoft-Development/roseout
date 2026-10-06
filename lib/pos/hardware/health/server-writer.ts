import { recordPosHardwareHeartbeat } from "@/lib/pos/hardware/device-registry";
import type { PosHardwareHeartbeatWriter } from "@/lib/pos/hardware/health/health";

export const posHardwareHeartbeatWriter: PosHardwareHeartbeatWriter = {
  async record(input) {
    await recordPosHardwareHeartbeat(input);
  },
};
