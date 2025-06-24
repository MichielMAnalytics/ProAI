import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from './Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  totalItems: number;
  showItemsPerPage?: boolean;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  className?: string;
}

const ITEMS_PER_PAGE_OPTIONS = [6, 12, 24, 48, 96];

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  totalItems,
  showItemsPerPage = true,
  onItemsPerPageChange,
  className = '',
}: PaginationProps) {
  // Calculate visible page numbers with fewer pages shown
  const getVisiblePages = (): (number | string)[] => {
    const delta = 1; // Show only 1 page on each side of current page for cleaner look
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];

    // Always show first page
    if (totalPages > 1) {
      rangeWithDots.push(1);
    }

    // Add dots and middle range if needed
    if (currentPage > 3) {
      rangeWithDots.push('...');
    }

    // Add pages around current page
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      if (i !== 1 && i !== totalPages) {
        range.push(i);
      }
    }

    rangeWithDots.push(...range);

    // Add dots and last page if needed
    if (currentPage < totalPages - 2) {
      rangeWithDots.push('...');
    }

    // Always show last page if different from first
    if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    // Remove duplicates
    return [...new Set(rangeWithDots)];
  };

  const visiblePages = getVisiblePages();
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className} ${className.includes('premium-pagination') ? 'premium-pagination-wrapper' : ''}`}>
      {/* Items info */}
      <div className="text-sm text-text-secondary">
         <span className="font-semibold text-text-primary">{startItem.toLocaleString()}</span>-<span className="font-semibold text-text-primary">{endItem.toLocaleString()}</span> of{' '}
        <span className="font-semibold text-text-primary">{totalItems.toLocaleString()}</span>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-4">
        {/* Items per page selector */}
        {showItemsPerPage && onItemsPerPageChange && (
          <div className="relative">
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="appearance-none rounded-lg border-none bg-surface-primary backdrop-blur-sm px-3 py-1.5 pr-8 text-sm font-medium text-text-primary focus:outline-none transition-all duration-200"
            >
              {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <svg className="h-4 w-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          {/* Previous button */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              currentPage === 1
                ? 'text-text-tertiary cursor-not-allowed'
                : 'text-text-primary hover:text-text-primary hover:bg-surface-hover'
            }`}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline"></span>
          </button>

          {/* Page numbers */}
          {visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <div
                  key={`dots-${index}`}
                  className="flex h-8 w-8 items-center justify-center text-text-tertiary"
                  aria-hidden="true"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </div>
              );
            }

            const pageNumber = page as number;
            const isCurrentPage = pageNumber === currentPage;

            return (
              <button
                key={pageNumber}
                onClick={() => onPageChange(pageNumber)}
                className={`h-8 w-8 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isCurrentPage
                    ? 'bg-surface-primary text-green-600 hover:bg-green-50 dark:bg-surface-primary dark:text-green-400 dark:hover:bg-green-900/10'
                    : 'text-text-primary hover:text-text-primary hover:bg-surface-hover'
                }`}
                aria-label={`Go to page ${pageNumber}`}
                aria-current={isCurrentPage ? 'page' : undefined}
              >
                {pageNumber}
              </button>
            );
          })}

          {/* Next button */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              currentPage === totalPages
                ? 'text-text-tertiary cursor-not-allowed'
                : 'text-text-primary hover:text-text-primary hover:bg-surface-hover'
            }`}
            aria-label="Go to next page"
          >
            <span className="hidden sm:inline"></span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Pagination;
