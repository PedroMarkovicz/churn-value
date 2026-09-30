import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; Radix measures its slider thumb with one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
}

// jsdom does not implement element scrolling; TanStack Virtual scrolls a row into view with it.
if (!("scrollTo" in Element.prototype)) {
  Object.assign(Element.prototype, { scrollTo: () => undefined });
}
