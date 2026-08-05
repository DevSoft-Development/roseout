import { searchV2 as coreSearchV2 } from "./search/v2/index";

export * from "./search/v2/index";

type SearchV2Input = Parameters<typeof coreSearchV2>[0];
type SearchV2Response = Awaited<ReturnType<typeof coreSearchV2>>;
type SearchV2Executor = (input: SearchV2Input) => Promise<SearchV2Response>;
type ExecutionMode = "served" | "strict";

const REPLAY_MODE_SUFFIX = /:(canonical|strict)$/;

function executionMode(input: SearchV2Input): ExecutionMode {
  return input.rolloutOverride?.strictNoFallback === true ? "strict" : "served";
}

function sharedExecutionKey(input: SearchV2Input) {
  const requestId = String(input.requestId ?? "");
  if (!REPLAY_MODE_SUFFIX.test(requestId)) return null;
  if (input.rolloutOverride?.mode !== "primary") return null;
  return `${requestId.replace(REPLAY_MODE_SUFFIX, "")}:${String(input.query ?? "").trim().toLowerCase()}`;
}

function sharedPipelineInput(input: SearchV2Input): SearchV2Input {
  const rolloutOverride = input.rolloutOverride
    ? { ...input.rolloutOverride, strictNoFallback: false }
    : input.rolloutOverride;
  return {
    ...input,
    requestId: String(input.requestId ?? "").replace(REPLAY_MODE_SUFFIX, ":shared"),
    rolloutOverride,
  };
}

function cloneResponse(response: SearchV2Response): SearchV2Response {
  if (typeof structuredClone === "function") return structuredClone(response);
  return JSON.parse(JSON.stringify(response)) as SearchV2Response;
}

function annotateResponse(response: SearchV2Response, mode: ExecutionMode, sharedExecutionId: string | null) {
  const cloned = cloneResponse(response) as any;
  cloned.debug = {
    ...(cloned.debug ?? {}),
    executionMode: mode,
    sharedExecutionId,
    sharedPipeline: sharedExecutionId != null,
    strictPolicy: mode === "strict"
      ? {
          evaluatesServedPipeline: true,
          legacyFallbackUsed: Boolean(cloned?.retrieval?.legacyFallbackUsed),
          fallbackDomains: Array.isArray(cloned?.retrieval?.fallbackDomains)
            ? cloned.retrieval.fallbackDomains
            : [],
        }
      : null,
  };
  return cloned as SearchV2Response;
}

export function createSearchV2ExecutionCoordinator(execute: SearchV2Executor) {
  const inFlight = new Map<string, Promise<SearchV2Response>>();

  return async function coordinatedSearchV2(input: SearchV2Input): Promise<SearchV2Response> {
    const mode = executionMode(input);
    const key = sharedExecutionKey(input);
    if (!key) return execute(input);

    let promise = inFlight.get(key);
    if (!promise) {
      promise = execute(sharedPipelineInput(input));
      inFlight.set(key, promise);
      void promise.finally(() => {
        setTimeout(() => inFlight.delete(key), 5_000);
      });
    }

    const response = await promise;
    return annotateResponse(response, mode, key);
  };
}

const coordinatedSearchV2 = createSearchV2ExecutionCoordinator(coreSearchV2);

export async function searchV2(input: SearchV2Input) {
  return coordinatedSearchV2(input);
}
