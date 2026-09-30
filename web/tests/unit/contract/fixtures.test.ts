import { validateArtifact } from "@/contract/load.ts";

import {
  customerFixture,
  customersFixture,
  featureSpecFixture,
  manifestFixture,
  timelinesFixture,
} from "../fixtures/artifacts.ts";

test("every fixture builder produces a valid artifact", () => {
  expect(() => validateArtifact("manifest", manifestFixture())).not.toThrow();
  expect(() =>
    validateArtifact("customers", customersFixture([customerFixture(1, 0.4, 1)])),
  ).not.toThrow();
  expect(() => validateArtifact("feature_spec", featureSpecFixture())).not.toThrow();
  expect(() =>
    validateArtifact(
      "timelines",
      timelinesFixture([customerFixture(1, 0.4, 1), customerFixture(2, 0.4, 0)]),
    ),
  ).not.toThrow();
});
