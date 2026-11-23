export function paginate<T>(rows: T[], requested: number, size = 10) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, requested));
  return { items: rows.slice((page - 1) * size, page * size), page, pages, total: rows.length };
}
