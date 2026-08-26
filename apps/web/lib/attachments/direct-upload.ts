export function uploadDirectly(
  url: string,
  headers: Readonly<Record<string, string>>,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Object storage rejected the upload (${request.status})`));
    });
    request.addEventListener("error", () => reject(new Error("Could not reach object storage")));
    request.addEventListener("abort", () => reject(new Error("Upload was canceled")));
    request.send(file);
  });
}
