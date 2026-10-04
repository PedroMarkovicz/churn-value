import { downloadText } from "@/pages/customers/download.ts";

test("the download link is in the page when clicked, and its URL outlives the click", () => {
  vi.useFakeTimers();
  const create = vi.fn(() => "blob:csv");
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  let inPage = false;
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    inPage = document.body.contains(this);
  });
  try {
    downloadText("a,b\n1,2\n", "customers.csv");
    expect(click).toHaveBeenCalledTimes(1);
    expect(inPage).toBe(true); // Safari and older Firefox ignore a click on a detached link
    expect(document.querySelector("a[download]")).toBeNull(); // and it is removed afterwards
    vi.advanceTimersByTime(999);
    expect(revoke).not.toHaveBeenCalled(); // revoking at once can cancel the download
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith("blob:csv");
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
