/** Everything the scenario-driven pages need, loaded and validated once by the root route. */
import type { CustomersFile, EvaluationFile, FeatureSpec, Manifest } from "@/contract/index.ts";
import { loadArtifact } from "@/contract/load.ts";
import { buildTable, type CustomerTable } from "@/domain/table.ts";

export interface AppData {
  manifest: Manifest;
  customers: CustomersFile;
  evaluation: EvaluationFile;
  featureSpec: FeatureSpec;
  table: CustomerTable;
}

export async function loadAppData(): Promise<AppData> {
  // The manifest first: an incompatible contract should be reported before anything else.
  const manifest = await loadArtifact("manifest");
  const [customers, evaluation, featureSpec] = await Promise.all([
    loadArtifact("customers"),
    loadArtifact("evaluation"),
    loadArtifact("feature_spec"),
  ]);
  return { manifest, customers, evaluation, featureSpec, table: buildTable(customers) };
}
