import React, { useState } from 'react';
import type { SessionTimelineEvent } from '../../types/support';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Code,
  CreditCard,
  Camera,
  Layers,
  Printer,
  CloudUpload,
  Send,
} from 'lucide-react';

interface SessionTimelineProps {
  events: SessionTimelineEvent[];
  isLoading?: boolean;
}

export const SessionTimeline: React.FC<SessionTimelineProps> = ({ events, isLoading = false }) => {
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStageIcon = (stage: string) => {
    switch (stage.toUpperCase()) {
      case 'PAYMENT':
        return CreditCard;
      case 'CAPTURE':
        return Camera;
      case 'PROCESSING':
        return Layers;
      case 'PRINTING':
        return Printer;
      case 'STORAGE':
        return CloudUpload;
      case 'DELIVERY':
        return Send;
      default:
        return Clock;
    }
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return {
          icon: CheckCircle2,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          line: 'bg-emerald-500/30',
        };
      case 'WARNING':
        return {
          icon: AlertTriangle,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/20',
          line: 'bg-amber-500/30',
        };
      case 'FAILED':
        return {
          icon: XCircle,
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/20',
          line: 'bg-rose-500/30',
        };
      default:
        return {
          icon: Clock,
          color: 'text-slate-400',
          bg: 'bg-slate-800 border-slate-700',
          line: 'bg-slate-800',
        };
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-xs text-slate-500 space-y-2">
        <Clock className="w-5 h-5 mx-auto animate-spin text-indigo-400" />
        <p>Loading session audit timeline...</p>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500">
        No lifecycle events recorded for this session.
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-6">
      {/* Vertical Connecting Line */}
      <div className="absolute left-[17px] top-3 bottom-3 w-0.5 bg-slate-800" />

      {events.map((event, idx) => {
        const indicator = getStatusIndicator(event.status);
        const StageIcon = getStageIcon(event.stage);
        const isExpanded = !!expandedEvents[event.id];

        let parsedPayload: any = null;
        if (event.payload) {
          try {
            parsedPayload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
          } catch {
            parsedPayload = event.payload;
          }
        }

        return (
          <div key={event.id || idx} className="relative flex items-start gap-4 group">
            {/* Step Node Icon */}
            <div
              className={`relative z-10 w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-md ${indicator.bg} ${indicator.color}`}
            >
              <StageIcon className="w-4 h-4" />
            </div>

            {/* Event Content Box */}
            <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 hover:border-slate-700/80 transition shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-white tracking-wide">
                    {event.eventType.replace(/_/g, ' ')}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                    {event.stage}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 text-xs">
                  {event.durationMs !== null && event.durationMs !== undefined && (
                    <span className="font-mono text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      +{(event.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(event.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                  </span>
                </div>
              </div>

              {/* Error Message if failed */}
              {event.errorMessage && (
                <div className="mt-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    {event.errorCode && (
                      <span className="font-mono font-bold block text-rose-400">{event.errorCode}</span>
                    )}
                    <p>{event.errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Collapsible Payload Inspector */}
              {parsedPayload && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(event.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 transition"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Code className="w-3 h-3 text-indigo-400" />
                    <span>{isExpanded ? 'Hide Payload' : 'Inspect Raw Event JSON'}</span>
                  </button>

                  {isExpanded && (
                    <pre className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-indigo-200 overflow-x-auto max-h-48 leading-relaxed">
                      {JSON.stringify(parsedPayload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
