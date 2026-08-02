/** Chars of each parent's output included in the child prompt. */
export const UPSTREAM_SNIPPET_CAP = 2000;

/**
 * Cap a parent task's result for stitching into a child prompt.
 *
 * Keeps the **tail** of long outputs. Subagent conclusions, file contracts, and
 * actionable next steps almost always land at the end; keeping the head silently
 * drops exactly the content dependents need.
 */
export function truncateUpstreamSnippet(s: string, n: number): string {
  if (n <= 0) return "";
  if (s.length <= n) return s;
  const marker = "…";
  if (n <= marker.length) return s.slice(s.length - n);
  return marker + s.slice(s.length - (n - marker.length));
}
