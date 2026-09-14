import React, { useState, useEffect } from 'react';
import { StatusBadge } from '../common/StatusBadge';
import type { Booth } from '../../types/booth';
import { MapPin, Settings2, Laptop } from 'lucide-react';

interface BoothsTableProps {
  booths: Booth[];
  onInspect: (booth: Booth) => void;
  onPair?: (booth: Booth) => void;
  isLoading?: boolean;
}


export const BoothsTable: React.FC<BoothsTableProps> = ({
  booths,
  onInspect,
  onPair,
  isLoading = false,
}) => {

  // Relative time ticker updating every second
  const [, setTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatRelativeTime = (lastSeenStr: string | null) => {
    if (!lastSeenStr) return 'Never seen';
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(lastSeenStr).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm">Loading registered booths...</p>
      </div>
    );
  }

  if (booths.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-2 rounded-2xl bg-slate-900/40 border border-slate-800">
        <p className="text-base font-semibold text-slate-300">No booths found</p>
        <p className="text-xs text-slate-500">
          No photobooths match the selected filters or search criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-xl">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono uppercase tracking-wider text-[11px]">
          <tr>
            <th className="py-4 px-6">Booth & Location</th>
            <th className="py-4 px-6">Status</th>
            <th className="py-4 px-6">Version</th>
            <th className="py-4 px-6">Host Runtime</th>
            <th className="py-4 px-6">Last Heartbeat</th>
            <th className="py-4 px-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300">
          {booths.map((booth) => (
            <tr
              key={booth.id}
              className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
              onClick={() => onInspect(booth)}
            >
              {/* Booth & Branch */}
              <td className="py-4 px-6">
                <div>
                  <div className="font-bold text-white text-sm tracking-wide font-['Outfit',sans-serif] group-hover:text-indigo-300 transition">
                    {booth.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5">
                    <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span>{booth.branch?.name || 'Unassigned Branch'}</span>
                  </div>
                </div>
              </td>

              {/* Status */}
              <td className="py-4 px-6">
                <StatusBadge status={booth.status} isMaintenance={booth.isMaintenance} />
              </td>

              {/* Version */}
              <td className="py-4 px-6 font-mono">
                <div className="text-slate-200 font-semibold">
                  {booth.appVersion ? `v${booth.appVersion}` : 'v1.0.0'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {booth.gitCommit ? `git:${booth.gitCommit}` : 'stable'}
                </div>
              </td>

              {/* Host Machine & Paired Status */}
              <td className="py-4 px-6 font-mono text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-200 truncate max-w-[140px] font-semibold">
                    {booth.machineName || 'kiosk-host'}
                  </span>
                  {booth.device?.status === 'ACTIVE' ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      PAIRED
                    </span>
                  ) : booth.device?.status === 'REVOKED' ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                      REVOKED
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 border border-slate-700">
                      UNPAIRED
                    </span>
                  )}
                </div>
                <div className="text-slate-500 text-[10px]">
                  {booth.localIp || '127.0.0.1'}
                </div>
              </td>


              {/* Last Seen relative */}
              <td className="py-4 px-6 font-mono text-slate-300">
                <span className="font-semibold text-slate-200">
                  {formatRelativeTime(booth.lastSeen)}
                </span>
              </td>

              {/* Action */}
              <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  {(!booth.device || booth.device.status !== 'ACTIVE') && onPair && (
                    <button
                      type="button"
                      onClick={() => onPair(booth)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white transition text-xs font-bold shadow-sm"
                      title="Hubungkan laptop kiosk fisik ke booth ini"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      Pair
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onInspect(booth)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 hover:bg-indigo-600 hover:border-indigo-500 text-slate-200 hover:text-white transition text-xs font-medium shadow-sm"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Inspect
                  </button>
                </div>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
