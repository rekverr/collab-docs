"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { SearchDocumentResult } from "../../lib/api/types";
import { workspaceIdFromPath } from "../../lib/search/search-state";
import { useSession } from "../auth/session-provider";

const debounceMilliseconds = 300;

export function WorkspaceSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParameters = useSearchParams();
  const session = useSession();
  const workspaceId = workspaceIdFromPath(pathname);
  const urlQuery = searchParameters.get("q") ?? "";
  const [input, setInput] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery.trim());
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SearchDocumentResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => setInput(urlQuery), [urlQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = input.trim();
      if (nextQuery !== query) {
        setQuery(nextQuery);
        setPage(1);
        setItems([]);
        setHasMore(false);
        setError(null);
      }
      const nextParameters = new URLSearchParams(searchParameters.toString());
      if (nextQuery === "") nextParameters.delete("q");
      else nextParameters.set("q", nextQuery);
      const nextSearch = nextParameters.toString();
      if (nextSearch !== searchParameters.toString()) {
        const nextUrl = `${pathname}${nextSearch === "" ? "" : `?${nextSearch}`}`;
        router.replace(nextUrl, { scroll: false });
      }
    }, debounceMilliseconds);
    return () => window.clearTimeout(timer);
  }, [input, pathname, query, router, searchParameters]);

  useEffect(() => {
    if (workspaceId === null || query.length < 2) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    void session
      .withAccessToken((token) =>
        searchApi.documents(token, workspaceId, {
          query,
          page,
          limit: 10,
          signal: controller.signal,
        }),
      )
      .then((response) => {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setItems((current) =>
          page === 1 ? response.items : mergeResults(current, response.items),
        );
        setHasMore(response.hasMore);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return;
        if (generation === requestGeneration.current) setError(apiErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === requestGeneration.current) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [page, query, session, workspaceId]);

  const status = useMemo(() => {
    if (query.length < 2) return "Type at least 2 characters";
    if (loading && page === 1) return "Searching…";
    if (error !== null) return error;
    if (items.length === 0) return "No matching documents";
    return null;
  }, [error, items.length, loading, page, query.length]);

  if (workspaceId === null) return null;
  const open = input.trim().length > 0;
  return (
    <div className="workspace-search">
      <label className="sr-only" htmlFor="workspace-search-input">
        Search workspace documents
      </label>
      <input
        id="workspace-search-input"
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Search documents…"
        autoComplete="off"
        aria-expanded={open}
        aria-controls="workspace-search-results"
      />
      {open && (
        <div className="search-popover" id="workspace-search-results">
          {status !== null && (
            <p className={error === null ? "muted small" : "error-message small"} role="status">
              {status}
            </p>
          )}
          {items.length > 0 && (
            <ul className="search-results">
              {items.map((item) => (
                <li key={item.documentId}>
                  <Link href={`/app/workspaces/${workspaceId}/documents/${item.documentId}`}>
                    <strong>{item.title}</strong>
                    {item.snippet !== null && <span>{item.snippet}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <button
              className="text-button search-more"
              disabled={loading}
              type="button"
              onClick={() => setPage((current) => current + 1)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function mergeResults(
  current: SearchDocumentResult[],
  incoming: SearchDocumentResult[],
): SearchDocumentResult[] {
  const results = new Map(current.map((item) => [item.documentId, item]));
  for (const item of incoming) results.set(item.documentId, item);
  return [...results.values()];
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}
