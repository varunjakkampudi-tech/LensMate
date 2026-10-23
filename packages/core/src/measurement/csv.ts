/**
 * Minimal CSV reader and writer for measurement files. Handles quoted fields, embedded commas, quotes and
 * line breaks, and both LF and CRLF line endings. No dependency is needed for the P-1 template.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"') {
        if (text.charAt(index + 1) === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text.charAt(index + 1) === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
    index += 1;
  }

  if (quoted) {
    throw new SyntaxError("unterminated quoted field");
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((line) => !(line.length === 1 && line[0] === ""));
}

/** One CSV line with no trailing newline. Fields with commas, quotes or line breaks are quoted. */
export function formatCsvLine(fields: readonly string[]): string {
  return fields.map(escapeField).join(",");
}

function escapeField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
