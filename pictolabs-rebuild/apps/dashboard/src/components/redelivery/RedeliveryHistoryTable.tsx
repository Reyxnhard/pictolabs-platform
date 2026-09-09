import React from 'react';
import type { RedeliveryLogItem } from '../../types/support';
import { History, Mail, Link2, Printer, CheckCircle2, XCircle } from 'lucide-react';

interface RedeliveryHistoryTableProps {
  logs: RedeliveryLogItem[];
  isLoading?: boolean;
}

export const RedeliveryHistoryTable: React.FC<RedeliveryHistoryTableProps> = ({
  logs,
  isLoading = false,
}) => {
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'RESEND_EMAIL':
        return <Mail className="w-3.5 h-3.5 text-indigo-400" />;
      case 'EXTEND_LINK':
        return <Link2 className="w-3.5 h-3.5 text-purple-400" />;
      case 'PHYSICAL_REPRINT':
        return <Printer className="w-3.5 h-3.5 text-orange-400" />;
      default:
        return <History className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  if (isLoading) {
    return <div className="py-4 text-center text-xs text-slate-500">Loading audit history...</div>;
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800/60">
        No remediation actions executed on this session yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
          <tr>
            <th className="py-2.5 px-3">Action</th>
            <th className="py-2.5 px-3">Operator</th>
            <th className="py-2.5 px-3">Recipient / Target</th>
            <th className="py-2.5 px-3">Reason</th>
            <th className="py-2.5 px-3">Status</th>
            <th className="py-2.5 px-3">Timestamp (WIB)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 font-sans">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-800/30 transition">
              <td className="py-2.5 px-3 font-mono font-semibold text-slate-200">
                <div className="flex items-center gap-1.5">
                  {getActionIcon(log.actionType)}
                  <span>{log.actionType.replace(/_/g, ' ')}</span>
                </div>
              </td>
              <td className="py-2.5 px-3 font-mono text-slate-400">{log.operatorEmail}</td>
              <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px] truncate max-w-[150px]">
                {log.recipient || 'N/A'}
              </td>
              <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate">{log.reason}</td>
              <td className="py-2.5 px-3">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    log.status === 'SUCCESS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {log.status === 'SUCCESS' ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {log.status}
                </span>
              </td>
              <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                {new Date(log.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
