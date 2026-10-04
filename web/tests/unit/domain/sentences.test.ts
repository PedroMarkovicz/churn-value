import { policyTitle, sensitivityHeadline } from "@/domain/headlines.ts";
import { breakEvenAcceptance } from "@/domain/stress.ts";

test("a list with no churner on it is not said to lose at any rate for another reason", () => {
  expect(breakEvenAcceptance({ gain: 0, loss: 5, churners: 0 }, 3)).toEqual({
    kind: "no-churners",
  });
  expect(sensitivityHeadline({ kind: "no-churners" })).toBe(
    "Nobody on this list would have left, so it cannot pay at any acceptance rate.",
  );
  // a list with churners that still needs more than 100% acceptance keeps the old sentence
  expect(breakEvenAcceptance({ gain: 4, loss: 5, churners: 2 }, 3)).toEqual({ kind: "never" });
  expect(sensitivityHeadline({ kind: "never" })).toBe(
    "This list loses money at any acceptance rate.",
  );
});

test("the policy title does not say the model keeps 0% when it loses money", () => {
  expect(policyTitle(0.26)).toBe("The model keeps 26% of what perfect foresight would earn");
  expect(policyTitle(0)).toBe("The model keeps 0% of what perfect foresight would earn");
  expect(policyTitle(-0.4)).toBe(
    "The model loses money under these assumptions; perfect foresight would not",
  );
  expect(policyTitle(null)).toBe("What each policy would have earned");
});
