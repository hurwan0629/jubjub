export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  return (
    <div className="pagination-bar">
      <span>
        전체 <strong>{total}</strong>건
      </span>
      <nav className="pagination" aria-label="페이지 이동">
        <button aria-label="첫 페이지" disabled={page === 1} onClick={() => onChange(1)}>
          «
        </button>
        <button aria-label="이전 페이지" disabled={page === 1} onClick={() => onChange(page - 1)}>
          ‹
        </button>
        {Array.from({ length: Math.min(5, pages) }, (_, i) => start + i).map((n) => (
          <button
            key={n}
            aria-label={`${n}페이지`}
            aria-current={page === n ? 'page' : undefined}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
        <button aria-label="다음 페이지" disabled={page === pages} onClick={() => onChange(page + 1)}>
          ›
        </button>
        <button aria-label="마지막 페이지" disabled={page === pages} onClick={() => onChange(pages)}>
          »
        </button>
      </nav>
      <span>
        {page} / {pages} 페이지
      </span>
    </div>
  );
}
