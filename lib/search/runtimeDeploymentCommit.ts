export function resolveProductionDeploymentCommit(env: NodeJS.ProcessEnv = process.env) {
  return String(
    env.PLATFORM_RUNTIME_GIT_SHA ||
      env.GITHUB_SHA ||
      env.VERCEL_GIT_COMMIT_SHA ||
      "",
  ).trim() || null;
}
