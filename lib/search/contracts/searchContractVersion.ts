/**
 * Version of the internal contract between the canonical enterprise search
 * pipeline and bounded candidate-retrieval providers.
 *
 * Increment this value only when a request or response change is not backward
 * compatible.
 */
export const SEARCH_CANDIDATE_CONTRACT_VERSION = "candidate-search-v1" as const;

export type SearchCandidateContractVersion =
  typeof SEARCH_CANDIDATE_CONTRACT_VERSION;

export class SearchCandidateContractVersionError extends Error {
  readonly expectedVersion: SearchCandidateContractVersion;
  readonly receivedVersion: string | null;

  constructor(receivedVersion: unknown) {
    const normalizedReceivedVersion =
      typeof receivedVersion === "string" && receivedVersion.trim()
        ? receivedVersion.trim()
        : null;

    super(
      [
        "Candidate search contract version mismatch.",
        `Expected ${SEARCH_CANDIDATE_CONTRACT_VERSION}.`,
        `Received ${normalizedReceivedVersion ?? "missing"}.`,
      ].join(" "),
    );

    this.name = "SearchCandidateContractVersionError";
    this.expectedVersion = SEARCH_CANDIDATE_CONTRACT_VERSION;
    this.receivedVersion = normalizedReceivedVersion;
  }
}

export function assertSearchCandidateContractVersion(
  version: unknown,
): asserts version is SearchCandidateContractVersion {
  if (version !== SEARCH_CANDIDATE_CONTRACT_VERSION) {
    throw new SearchCandidateContractVersionError(version);
  }
}