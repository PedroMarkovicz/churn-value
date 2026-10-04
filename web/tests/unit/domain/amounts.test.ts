import { effectText, signedShap } from "@/domain/reasons.ts";
import { type Field, limitText, parseDraft, problems } from "@/domain/whatif.ts";

const field = (over: Partial<Field>): Field => ({
  name: "x",
  label: "X",
  group: "recent",
  unit: "",
  integer: false,
  flag: false,
  min: 0,
  max: 1,
  ...over,
});

test.each([
  ["500", 500],
  ["£500", 500],
  ["£ 20", 20],
  ["1,250", 1250],
  ["1,250.50", 1250.5],
  [" 12.5 ", 12.5],
  [".5", 0.5],
  ["-3", -3],
])("an amount typed as %s is read as %s", (text, value) => {
  expect(parseDraft(text)).toBe(value);
});

test.each(["", "£", "abc", "12abc", "1,25", "1,2,3", "1e3", "0x10", "Infinity"])(
  "text that is not an amount (%s) is not read as a number",
  (text) => {
    expect(parseDraft(text)).toBeNaN();
  },
);

test("a range limit is shown as a value the field accepts", () => {
  const pounds = field({ unit: "£", min: 24.35, max: 1234.567 });
  expect(limitText(pounds, "min")).toBe("£24.35"); // not £24, which would be refused
  expect(limitText(pounds, "max")).toBe("£1,234.56");
  expect(limitText(field({ unit: "£", min: 10, max: 2000 }), "max")).toBe("£2,000");
  const daysField = field({ unit: "days", integer: true, min: 1, max: 730 });
  expect(limitText(daysField, "min")).toBe("1");
  expect(limitText(daysField, "max")).toBe("730");
  const ratio = field({ min: 0.1234567, max: 3.9999 });
  expect(limitText(ratio, "min")).toBe("0.124");
  expect(limitText(ratio, "max")).toBe("3.999");
  expect(problems({ x: 20 }, [pounds])).toEqual([
    { field: "x", message: "Between £24.35 and £1,234.56." },
  ]);
  expect(problems({ x: 24.35 }, [pounds])).toEqual([]);
});

test("a reason whose size rounds to zero has no direction and no minus sign", () => {
  expect(effectText(0.16)).toBe("raises the risk");
  expect(effectText(-0.21)).toBe("lowers the risk");
  expect(effectText(-0.001)).toBe("no effect");
  expect(effectText(0)).toBe("no effect");
  expect(signedShap(0.16)).toBe("+0.16");
  expect(signedShap(-0.21)).toBe("−0.21");
  expect(signedShap(-0.001)).toBe("0.00");
});
