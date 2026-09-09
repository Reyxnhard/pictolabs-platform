import React, { useState } from 'react';
import { Wrench, Check, AlertTriangle } from 'lucide-react';

interface MaintenanceToggleProps {
  currentStatus: 'NORMAL' | 'MAINTENANCE';
  onToggle: (newStatus: 'NORMAL' | 'MAINTENANCE', reason: string) => Promise<void>;
  isLoading?: boolean;
}

export const MaintenanceToggle: React.FC<MaintenanceToggleProps> = ({
  currentStatus,
  onToggle,
  isLoading = false,
}) => {
  const isMaintenance = currentStatus === 'MAINTENANCE';
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextStatus = isMaintenance ? 'NORMAL' : 'MAINTENANCE';
    await onToggle(nextStatus, reason);
    setShowConfirm(false);
    setReason('');
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isMaintenance ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'}`}>
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">
              Administrative Maintenance Mode
            </h4>
            <p className="text-xs text-slate-400">
              {isMaintenance
                ? 'Kiosk is currently locked out of service for maintenance.'
                : 'Kiosk operates normally with automatic health monitoring.'}
            </p>
          </div>
        </div>

        {!showConfirm && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition border ${
              isMaintenance
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/30'
            }`}
          >
            {isMaintenance ? 'Resume Normal Mode' : 'Lock in Maintenance'}
          </button>
        )}
      </div>

      {showConfirm && (
        <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-800/80 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Confirm Maintenance Mode Transition</p>
              <p className="text-[11px] text-amber-400/80 mt-0.5">
                {isMaintenance
                  ? 'Switching back to NORMAL will allow customers to initiate photo sessions.'
                  : 'Locking to MAINTENANCE will display an out-of-service screen on the physical kiosk.'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Maintenance Reason / Notes
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isMaintenance ? 'e.g. Paper refilled, camera recalibrated' : 'e.g. Replacing DNP paper roll and ribbon'}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setShowConfirm(false);
                setReason('');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {isLoading ? 'Saving...' : isMaintenance ? 'Confirm Resume' : 'Confirm Lock'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
