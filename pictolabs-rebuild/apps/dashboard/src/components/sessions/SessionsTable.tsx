import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionListItem } from '../../types/session';
import { LifecycleBadge } from '../common/LifecycleBadge';
import { CopyButton } from '../common/CopyButton';
import { Image as ImageIcon, MapPin, Printer, Eye } from 'lucide-react';

interface SessionsTableProps {
  sessions: SessionListItem[];
  onSelectSession: (session: SessionListItem) => void;
  isLoading?: boolean;
}

export const SessionsTable: React.FC<SessionsTableProps> = ({
  sessions,
  onSelectSession,
  isLoading = false,
}) => {
  const navigate = useNavigate();

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return (
        d.toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm">Querying sessions archive...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-2 rounded-2xl bg-slate-900/40 border border-slate-800">
        <p className="text-base font-semibold text-slate-300">No sessions found</p>
        <p className="text-xs text-slate-500">
          Try broadening your search query or selecting a different date range.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-xl">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono uppercase tracking-wider text-[11px]">
          <tr>
            <th className="py-4 px-6">Session ID</th>
            <th className="py-4 px-6">Booth & Location</th>
            <th className="py-4 px-6">Timestamp (WIB)</th>
            <th className="py-4 px-6">Lifecycle Status</th>
            <th className="py-4 px-6">Prints</th>
            <th className="py-4 px-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300">
          {sessions.map((session) => (
            <tr
              key={session.id}
              className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
              onClick={() => onSelectSession(session)}
            >
              {/* Session ID */}
              <td className="py-4 px-6 font-mono" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100 group-hover:text-indigo-300 transition">
                    {session.id}
                  </span>
                  <CopyButton text={session.id} label="" />
                </div>
              </td>

              {/* Booth & Branch */}
              <td className="py-4 px-6">
                <div>
                  <div className="font-bold text-white tracking-wide font-['Outfit',sans-serif]">
                    {session.boothName}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                    <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span>{session.branchName}</span>
                  </div>
                </div>
              </td>

              {/* Timestamp */}
              <td className="py-4 px-6 font-mono text-slate-300">
                {formatTimestamp(session.createdAt)}
              </td>

              {/* Status */}
              <td className="py-4 px-6">
                <LifecycleBadge status={session.status} />
              </td>

              {/* Prints & Photos count */}
              <td className="py-4 px-6 font-mono text-slate-300">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>{session.printCount > 0 ? `${session.printCount} sheet(s)` : 'Digital only'}</span>
                </div>
              </td>

              {/* Actions */}
              <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/gallery?sessionId=${session.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white transition text-xs font-semibold shadow-sm"
                    title="Inspect assets in gallery"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Gallery
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectSession(session)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs"
                    title="View session details"
                  >
                    <Eye className="w-3.5 h-3.5" />
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
