type Cell = string | number | null | undefined;

/** Download rows as a CSV file (UTF-8 with BOM so Excel reads it correctly). */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const escape = (value: Cell): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
