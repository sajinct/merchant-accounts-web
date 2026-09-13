/** Local date as YYYY-MM-DD, the format Postgres `date` columns and `<input type="date">` use. */
export function isoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function firstOfMonth(date: Date = new Date()): string {
  return isoDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}
