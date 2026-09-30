/**
 * Fetch, validate and cache the artifacts (spec §6.1). Every file is checked against its JSON
 * Schema before any code reads it; a failure names the file and the first offending field.
 */
import type {
  CalibratorFile,
  CustomersFile,
  EvaluationFile,
  ExperimentsFile,
  FeatureSpec,
  Manifest,
  TimelinesFile,
} from "./index.ts";
import {
  validate_calibrator,
  validate_customers,
  validate_evaluation,
  validate_experiments,
  validate_feature_spec,
  validate_manifest,
  validate_timelines,
} from "./validators.gen.js";
import { APP_CONTRACT_VERSION, isCompatible } from "./version.ts";

export interface ArtifactTypes {
  manifest: Manifest;
  customers: CustomersFile;
  timelines: TimelinesFile;
  evaluation: EvaluationFile;
  experiments: ExperimentsFile;
  feature_spec: FeatureSpec;
  calibrator: CalibratorFile;
}
export type ArtifactName = keyof ArtifactTypes;

type Guard<T> = ((data: unknown) => data is T) & {
  errors?: { instancePath: string; message?: string }[] | null;
};
const VALIDATORS: { [K in ArtifactName]: Guard<ArtifactTypes[K]> } = {
  manifest: validate_manifest,
  customers: validate_customers,
  timelines: validate_timelines,
  evaluation: validate_evaluation,
  experiments: validate_experiments,
  feature_spec: validate_feature_spec,
  calibrator: validate_calibrator,
};

/** Why an artifact could not be used; rendered by the data error page. */
export class ArtifactError extends Error {
  readonly artifact: string;
  readonly reason: string;

  constructor(artifact: string, reason: string) {
    super(`${artifact}: ${reason}`);
    this.name = "ArtifactError";
    this.artifact = artifact;
    this.reason = reason;
  }
}

export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

/** Throws an ArtifactError unless `data` matches the schema of `name`. */
export function validateArtifact<K extends ArtifactName>(name: K, data: unknown): ArtifactTypes[K] {
  const validate = VALIDATORS[name];
  if (validate(data)) return data;
  const first = validate.errors?.[0];
  const where = first?.instancePath ? first.instancePath : "(root)";
  throw new ArtifactError(`${name}.json`, `${where} ${first?.message ?? "is invalid"}`);
}

async function fetchJson(url: string, file: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ArtifactError(file, "the network request failed");
  }
  if (!response.ok) throw new ArtifactError(file, `HTTP ${response.status}`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ArtifactError(file, "is not valid JSON");
  }
}

const cache = new Map<ArtifactName, Promise<unknown>>();

/** The artifact `name`, fetched and validated once per page load. */
export function loadArtifact<K extends ArtifactName>(
  name: K,
  base = DATA_BASE,
): Promise<ArtifactTypes[K]> {
  let pending = cache.get(name);
  if (!pending) {
    const file = `${name}.json`;
    pending = fetchJson(`${base}${file}`, file).then((data) => {
      // The version first: another major version may have another shape, and the useful message
      // then is the version, not the first field that no longer matches.
      if (name === "manifest") assertCompatibleVersion(data);
      return validateArtifact(name, data);
    });
    // A failed load must be retryable: forget it so the next call fetches again.
    pending.catch(() => cache.delete(name));
    cache.set(name, pending);
  }
  return pending as Promise<ArtifactTypes[K]>;
}

/** Throws unless `data` names a contract version this app can read (checked before its shape). */
export function assertCompatibleVersion(data: unknown): void {
  const version =
    data !== null && typeof data === "object" && "contract_version" in data
      ? data.contract_version
      : undefined;
  if (typeof version !== "string") return; // the schema check reports the missing field
  if (!isCompatible(version)) {
    throw new ArtifactError(
      "manifest.json",
      `contract ${version} cannot be read by this app (built for ${APP_CONTRACT_VERSION})`,
    );
  }
}

/** Test hook: forget every cached artifact. */
export function clearArtifactCache(): void {
  cache.clear();
}
