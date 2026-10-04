/** Save `text` as a file named `fileName`, without a server (the CSV of the Customers page). */
export function downloadText(
  text: string,
  fileName: string,
  type = "text/csv;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  // In the page while clicked: Safari and older Firefox ignore a click on a detached link.
  document.body.append(link);
  link.click();
  link.remove();
  // Not at once: revoking the URL before the browser has read it cancels the download.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
