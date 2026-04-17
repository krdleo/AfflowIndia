/**
 * CSV Generation Utility
 *
 * Generates RFC 4180 compliant CSV strings from headers and row data.
 * Used for exporting affiliate and referral data.
 */

/**
 * Escape a CSV field value.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 */
function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a CSV string from headers and rows.
 *
 * @param headers - Column header labels
 * @param rows - Array of row arrays, each containing values in header order
 * @returns CSV string with BOM for Excel compatibility
 */
export function generateCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const headerLine = headers.map(escapeCSVField).join(",");
  const dataLines = rows.map((row) => row.map(escapeCSVField).join(","));
  // UTF-8 BOM for Excel to recognize encoding correctly
  return "\uFEFF" + [headerLine, ...dataLines].join("\r\n");
}

/**
 * Create a downloadable CSV Response with proper headers.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
