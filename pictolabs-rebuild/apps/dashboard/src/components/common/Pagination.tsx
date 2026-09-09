import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SessionPagination } from '../../types/session';

interface PaginationProps {
  pagination: SessionPagination;
  onPageChange: (newPage: number) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  pagination,
  onPageChange,
  className = '',
}) => {
  const { page, totalPages, total } = pagination;

  if (totalPages <= 1 && total === 0) return null;

  return (
    <div className={`flex items-center justify-between px-4 py-3 bg-slate-900/40 border-t border-slate-800/80 ${className}`}>
      <div className="text-xs text-slate-400">
        Total <span className="font-semibold text-slate-200">{total}</span> records • Page{' '}
        <span className="font-semibold text-slate-200">{page}</span> of{' '}
        <span className="font-semibold text-slate-200">{totalPages || 1}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
