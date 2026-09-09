import React from 'react';
import type { SessionHealth } from '../../types/support';
import { CheckCircle2, AlertTriangle, XCircle, Clock, ShieldAlert, Wrench } from 'lucide-react';

interface SessionHealthCardProps {
  health: SessionHealth;
  onOpenReprint?: () => void;
  onOpenResendEmail?: () => void;
  onOpenExtendLink?: () => void;
}

export const SessionHealthCard: React.FC<SessionHealthCardProps> = ({
  health,
  onOpenReprint,
  onOpenResendEmail,
  onOpenExtendLink,
}) => {
  const getTheme = () => {
    switch (health.healthStatus) {
      case 'HEALTHY':
        return {
          icon: CheckCircle2,
          border: 'border-emerald-500/30',
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          title: 'Session Fulfilled — 0 Operational Anomalies',
        };
      case 'DEGRADED':
        return {
          icon: AlertTriangle,
          border: 'border-amber-500/30',
          bg: 'bg-amber-500/10',
          text: 'text-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          title: 'Degraded Performance — Non-Fatal Anomaly Detected',
        };
      case 'FAILED':
        return {
          icon: XCircle,
          border: 'border-rose-500/40',
          bg: 'bg-rose-500/10',
          text: 'text-rose-400',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          title: 'Critical Failure — Hardware or Payment Abort',
        };
      case 'ABANDONED':
      default:
        return {
          icon: Clock,
          border: 'border-slate-700/60',
          bg: 'bg-slate-800/40',
          text: 'text-slate-400',
          badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
          title: 'Session Incomplete / Abandoned by Customer',
        };
    }
  };

  const theme = getTheme();
  const Icon = theme.icon;

  return (
    <div className={`rounded-2xl border p-5 shadow-xl backdrop-blur-xl ${theme.bg} ${theme.border} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme.badgeBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-['Outfit',sans-serif]">
                {theme.title}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold border ${theme.badgeBg}`}>
                {health.healthStatus}
              </span>
            </div>
            {health.failureCategory && (
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                Category: <span className="text-slate-200 uppercase font-semibold">{health.failureCategory}</span>
                {health.failureStep && ` • Step: ${health.failureStep}`}
              </p>
            )}
          </div>
        </div>

        {health.errorCode && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono text-rose-300">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>{health.errorCode}</span>
          </div>
        )}
      </div>

      {/* Diagnosis & Recommended Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60 text-xs">
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">
            Diagnostic Analysis
          </span>
          <p className="text-slate-200 leading-relaxed font-sans">{health.diagnosticMessage}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 font-mono flex items-center gap-1">
            <Wrench className="w-3 h-3" /> Recommended Remediation
          </span>
          <p className="text-indigo-200 leading-relaxed font-sans">{health.recommendedAction}</p>
        </div>
      </div>

      {/* Action shortcuts */}
      {(onOpenReprint || onOpenResendEmail || onOpenExtendLink) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/40">
          <span className="text-[11px] text-slate-400 mr-2 font-mono">Quick Actions:</span>
          {onOpenReprint && (
            <button
              type="button"
              onClick={onOpenReprint}
              className="px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              Emergency Reprint
            </button>
          )}
          {onOpenResendEmail && (
            <button
              type="button"
              onClick={onOpenResendEmail}
              className="px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              Resend Delivery Email
            </button>
          )}
          {onOpenExtendLink && (
            <button
              type="button"
              onClick={onOpenExtendLink}
              className="px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              Extend Retention Link
            </button>
          )}
        </div>
      )}
    </div>
  );
};
