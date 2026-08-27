export function workspaceIdFromPath(pathname: string): string | null {
  const match = /^\/app\/workspaces\/([^/]+)/.exec(pathname);
  return match?.[1] === undefined ? null : decodeURIComponent(match[1]);
}
