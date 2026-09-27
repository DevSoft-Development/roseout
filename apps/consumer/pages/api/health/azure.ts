import type { NextApiRequest, NextApiResponse } from "next";

type AzureHealthPayload = {
  ok: true;
  service: "theouthaven-consumer";
  runtime: "azure-container-apps";
  provider: string;
  regionRole: string;
  revision: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<AzureHealthPayload | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const payload: AzureHealthPayload = {
    ok: true,
    service: "theouthaven-consumer",
    runtime: "azure-container-apps",
    provider: process.env.PLATFORM_RUNTIME_PROVIDER || "azure-consumer",
    regionRole: process.env.PLATFORM_RUNTIME_REGION_ROLE || "primary",
    revision: process.env.PLATFORM_RUNTIME_GIT_SHA || "",
  };

  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("x-theouthaven-health-revision", payload.revision);
  res.setHeader("x-theouthaven-region-role", payload.regionRole);
  res.status(200).json(payload);
}
