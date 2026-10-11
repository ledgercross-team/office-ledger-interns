interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (pages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-xl border border-charcoal/15 bg-white px-3 py-1.5 font-medium hover:bg-mist disabled:opacity-50"
      >
        Previous
      </button>
      <span className="text-charcoal-soft">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className="rounded-xl border border-charcoal/15 bg-white px-3 py-1.5 font-medium hover:bg-mist disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}
