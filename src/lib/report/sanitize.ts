const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Texto livre de terapeuta NUNCA vira markup no template (spec §5, red-team #2).
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => MAP[c]!);
}
