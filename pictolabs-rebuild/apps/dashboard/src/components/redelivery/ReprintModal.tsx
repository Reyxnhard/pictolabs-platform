import React, { useState } from 'react';
import { Printer, X, AlertTriangle } from 'lucide-react';
import { supportApi } from '../../services/supportApi';

interface ReprintModalProps {
  sessionId: string;
  boothName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReprintModal: React.FC<ReprintModalProps> = ({
  sessionId,
  boothName = 'Kiosk',
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [copies, setCopies] = useState(1);
  const [reason, setReason] = useState('PAPER_JAM');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setErrorMsg('Please confirm the emergency physical reprint checkbox.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      const res = await supportApi.triggerReprint(sessionId, {
        copies,
        reason,
        notes: notes.trim() || undefined,
        operatorEmail: 'owner@pictolabs.id',
      });
      setSuccessMsg(res.message || 'Reprint directive dispatched successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to dispatch reprint command');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-['Outfit',sans-serif]">
                Command Physical Strip Reprint
              </h3>
              <p className="text-xs font-mono text-slate-400">Target: {boothName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
            {successMsg}
          </div>
        )}

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            This commands the physical DNP thermal sublimation printer at <strong>{boothName}</strong> to cut and feed paper strips from its local 7-day SSD cache.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Print Copy Count
            </label>
            <div className="flex items-center gap-3">
              {[1, 2].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCopies(num)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold font-mono transition ${
                    copies === num
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {num} {num === 1 ? 'Copy' : 'Copies'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Mandatory Justification Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-orange-500 transition font-sans"
            >
              <option value="PAPER_JAM">PAPER_JAM — Cutter jammed or paper stalled</option>
              <option value="PRINT_DEFECT">PRINT_DEFECT — Ribbon discoloration / scratch</option>
              <option value="CUSTOMER_COURTESY">CUSTOMER_COURTESY — Replacement authorized by manager</option>
              <option value="TEST_PRINT">TEST_PRINT — Operator calibration check</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
              Operational Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cleared cutter jam on tray 1"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition font-sans"
            />
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-orange-500 focus:ring-0 focus:ring-offset-0"
              />
              <span>I confirm printer is physically clear and ready to print.</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !confirmed}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-lg shadow-orange-600/20 transition disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {isSubmitting ? 'Dispatching...' : 'Dispatch Reprint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
