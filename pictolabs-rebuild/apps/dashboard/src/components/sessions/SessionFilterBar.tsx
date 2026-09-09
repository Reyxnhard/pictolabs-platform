import React from 'react';
import { SearchInput } from '../common/SearchInput';
import type { Booth } from '../../types/booth';
import { RotateCcw } from 'lucide-react';

interface SessionFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  boothId: string;
  onBoothChange: (val: string) => void;
  status: string;
  onStatusChange: (val: string) => void;
  datePreset: string;
  onDatePresetChange: (val: string) => void;
  booths: Booth[];
  onReset: () => void;
}

export const SessionFilterBar: React.FC<SessionFilterBarProps> = ({
  search,
  onSearchChange,
  boothId,
  onBoothChange,
  status,
  onStatusChange,
  datePreset,
  onDatePresetChange,
  booths,
  onReset,
}) => {
  const isFiltered = search !== '' || boothId !== 'ALL' || status !== 'ALL' || datePreset !== 'ALL';

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
      {/* Search Input */}
      <div className="w-full sm:w-72">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search by Session ID..."
        />
      </div>

      {/* Booth Filter */}
      <div className="flex-1 min-w-[160px]">
        <select
          value={boothId}
          onChange={(e) => onBoothChange(e.target.value)}
          className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
        >
          <option value="ALL">All Booths</option>
          {booths.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.branch?.name || 'No Branch'})
            </option>
          ))}
        </select>
      </div>

      {/* Lifecycle Status Filter */}
      <div className="min-w-[140px]">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
        >
          <option value="ALL">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="PRINTING">Printing</option>
          <option value="CAPTURING">Capturing</option>
          <option value="PAID">Paid</option>
          <option value="PAYMENT_PENDING">Pending Payment</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* Date Presets */}
      <div className="min-w-[130px]">
        <select
          value={datePreset}
          onChange={(e) => onDatePresetChange(e.target.value)}
          className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
        >
          <option value="ALL">All Dates</option>
          <option value="TODAY">Today (WIB)</option>
          <option value="YESTERDAY">Yesterday</option>
          <option value="LAST_7_DAYS">Last 7 Days</option>
        </select>
      </div>

      {/* Reset Filter Button */}
      {isFiltered && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition"
          title="Reset all filters"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      )}
    </div>
  );
};
