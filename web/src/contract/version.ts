/** The contract version this build of the app was written against (ml/src/churnvalue/contract.py). */
export const APP_CONTRACT_VERSION = "1.2.0";

function parse(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Artifacts are readable when they share the app's major version and are at least its minor
 * version: minor versions only add fields, so newer artifacts still carry everything we read.
 */
export function isCompatible(artifactVersion: string, appVersion = APP_CONTRACT_VERSION): boolean {
  const artifact = parse(artifactVersion);
  const app = parse(appVersion);
  if (!artifact || !app) return false;
  return artifact[0] === app[0] && artifact[1] >= app[1];
}
