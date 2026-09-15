/** Financial year (1 April - 31 March) containing a date, named by its starting year. */
export function fyStart(date: Date = new Date()): number {
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
}

/** Financial year of a YYYY-MM-DD string. */
export function fyStartOfIso(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return m < 4 ? y - 1 : y;
}

/** 2026 -> "2026-27" */
export function fyLabel(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
