/**
 * A ResizeObserver stand-in for tests: an observed element reports `width` at once, and `fire`
 * reports another width later. Call `vi.unstubAllGlobals()` when the test is done.
 */
export function stubWidth(width: number) {
  const observed: Element[] = [];
  const callbacks = new Map<Element, ResizeObserverCallback>();
  const entry = (element: Element, value: number) =>
    [{ target: element, contentRect: { width: value } }] as unknown as ResizeObserverEntry[];
  class Stub {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(element: Element) {
      observed.push(element);
      callbacks.set(element, this.callback);
      this.callback(entry(element, width), this);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Stub);
  return {
    observed,
    fire(element: Element, value: number) {
      callbacks.get(element)?.(entry(element, value), {} as ResizeObserver);
    },
  };
}
