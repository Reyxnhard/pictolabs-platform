import React, { useState, useEffect, useCallback } from 'react';
import type { SessionListItem } from '../../types/session';
import type { SessionTimelineEvent, SessionHealth, RedeliveryLogItem } from '../../types/support';
import { supportApi } from '../../services/supportApi';
import { SessionHealthCard } from '../health/SessionHealthCard';
import { SessionTimeline } from '../timeline/SessionTimeline';
import { RedeliveryHistoryTable } from '../redelivery/RedeliveryHistoryTable';
import { EmailRedeliveryModal } from '../redelivery/EmailRedeliveryModal';
import { ExtendLinkModal } from '../redelivery/ExtendLinkModal';
import { ReprintModal } from '../redelivery/ReprintModal';
import { CopyButton } from '../common/CopyButton';
import { X, Image as ImageIcon, MapPin, Clock, Printer, Mail, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SessionDetailModalProps {
  sessionItem: SessionListItem | null;
  onClose: () => void;
}

export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({
  sessionItem,
  onClose,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'timeline' | 'audit'>('timeline');
  const [events, setEvents] = useState<SessionTimelineEvent[]>([]);
  const [health, setHealth] = useState<SessionHealth | null>(null);
  const [auditLogs, setAuditLogs] = useState<RedeliveryLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [isReprintModalOpen, setIsReprintModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!sessionItem) return;
    setIsLoading(true);
    try {
      const [eventsData, healthData, auditData] = await Promise.all([
        supportApi.getTimeline(sessionItem.id),
        supportApi.getHealth(sessionItem.id),
        supportApi.getRedeliveryHistory(sessionItem.id),
      ]);
      setEvents(eventsData);
      setHealth(healthData);
      setAuditLogs(auditData);
    } catch (err) {
      console.error('Failed to load session timeline/health:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionItem]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!sessionItem) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Dialog */}
        <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-slate-100 z-10 overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950/80">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white font-['Outfit',sans-serif]">
                  Session Observability & Support Center
                </h3>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{sessionItem.id}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 overflow-y-auto">
            {/* Health Diagnostic Card */}
            {health && (
              <SessionHealthCard
                health={health}
                onOpenReprint={() => setIsReprintModalOpen(true)}
                onOpenResendEmail={() => setIsEmailModalOpen(true)}
                onOpenExtendLink={() => setIsExtendModalOpen(true)}
              />
            )}

            {/* Quick Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 font-sans">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Photobooth</span>
                <span className="font-semibold text-white flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-indigo-400" />
                  {sessionItem.boothName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Branch</span>
                <span className="font-semibold text-slate-200 mt-0.5 block truncate">
                  {sessionItem.branchName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Prints</span>
                <span className="font-mono text-slate-200 mt-0.5 flex items-center gap-1">
                  <Printer className="w-3 h-3 text-slate-400" />
                  {sessionItem.printCount} sheet(s)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Timestamp</span>
                <span className="font-mono text-slate-300 text-[11px] mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {new Date(sessionItem.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                </span>
              </div>
            </div>

            {/* Customer Public Gallery Link */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
              <div className="overflow-hidden">
                <span className="text-[10px] font-semibold uppercase text-slate-400 font-mono block">
                  Public Customer Gallery Link
                </span>
                <span className="text-xs font-mono text-indigo-300 truncate block">
                  https://pictolabs.id/d/{sessionItem.id}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyButton text={`https://pictolabs.id/d/${sessionItem.id}`} label="Copy" />
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/gallery?sessionId=${sessionItem.id}`);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Assets
                </button>
              </div>
            </div>

            {/* Tab Navigation: Timeline vs Re-delivery History */}
            <div className="border-b border-slate-800 flex items-center gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className={`pb-2 text-xs font-bold uppercase tracking-wider font-mono transition border-b-2 ${
                  activeTab === 'timeline'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Lifecycle Timeline ({events.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`pb-2 text-xs font-bold uppercase tracking-wider font-mono transition border-b-2 ${
                  activeTab === 'audit'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Remediation Audit ({auditLogs.length})
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'timeline' ? (
              <div className="space-y-4">
                <SessionTimeline events={events} isLoading={isLoading} />
              </div>
            ) : (
              <div className="space-y-4">
                <RedeliveryHistoryTable logs={auditLogs} isLoading={isLoading} />
              </div>
            )}
          </div>

          {/* Footer with Remediation Actions */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition shadow-sm"
              >
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                Resend Email
              </button>
              <button
                type="button"
                onClick={() => setIsExtendModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition shadow-sm"
              >
                <Link2 className="w-3.5 h-3.5 text-purple-400" />
                Extend Link
              </button>
              <button
                type="button"
                onClick={() => setIsReprintModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 text-xs font-semibold transition shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-orange-400" />
                Reprint Strip
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Sub-modals for remediation */}
      <EmailRedeliveryModal
        sessionId={sessionItem.id}
        initialEmail={sessionItem.customerEmail}
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSuccess={loadData}
      />

      <ExtendLinkModal
        sessionId={sessionItem.id}
        isOpen={isExtendModalOpen}
        onClose={() => setIsExtendModalOpen(false)}
        onSuccess={loadData}
      />

      <ReprintModal
        sessionId={sessionItem.id}
        boothName={sessionItem.boothName}
        isOpen={isReprintModalOpen}
        onClose={() => setIsReprintModalOpen(false)}
        onSuccess={loadData}
      />
    </>
  );
};
