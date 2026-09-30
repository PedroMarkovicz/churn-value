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
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
