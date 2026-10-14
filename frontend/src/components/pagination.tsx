interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  pageSizeId?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizeOptions = [5, 10],
  pageSizeId = 'page-size',
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  if (pages <= 1 && !onPageSize) {
    return null;
  }

  return (
    <nav aria-label="Pagination" className="flex flex-col items-stretch gap-3 border-t border-charcoal/10 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p className="text-sm font-medium text-charcoal">
          Showing {firstShown}–{lastShown} of {total}
        </p>
        <p className="text-xs text-charcoal-soft">Adjust the page size or move through the result set.</p>
      </div>
      <div className="flex flex-wrap items-center justify-start gap-2 text-sm sm:justify-end">
        {onPageSize && (
          <>
            <label htmlFor={pageSizeId} className="font-medium text-charcoal">
              Page size
            </label>
            <select
              id={pageSizeId}
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              className="min-h-11 rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 outline-none focus:border-evergreen"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} rows
                </option>
              ))}
            </select>
          </>
        )}
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-charcoal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ <span className="sr-only">Previous</span>
        </button>
        <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-evergreen px-3 py-1.5 font-medium text-white" aria-current="page">
          {page}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(Math.min(pages, page + 1))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-charcoal hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Next</span> ›
        </button>
      </div>
    </nav>
  );
}
