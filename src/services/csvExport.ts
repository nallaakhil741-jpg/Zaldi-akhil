export function serializeCsv(
  columns: string[],
  records: Array<Record<string, unknown>>,
): string {
  const escapeCell = (value: unknown) => {
    const text = value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  return [
    columns.map(escapeCell).join(','),
    ...records.map((record) => columns.map((column) => escapeCell(record[column])).join(',')),
  ].join('\r\n');
}

export function downloadCsv(
  filename: string,
  columns: string[],
  records: Array<Record<string, unknown>>,
): void {
  const csv = serializeCsv(columns, records);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
