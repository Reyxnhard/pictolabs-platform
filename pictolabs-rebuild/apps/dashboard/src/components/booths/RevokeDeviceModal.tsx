import React, { useState } from 'react';
import { provisioningApi } from '../../services/provisioningApi';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import type { Booth } from '../../types/booth';

interface RevokeDeviceModalProps {
  booth: Booth;
  isOpen: boolean;
  onClose: () => void;
  onRevoked: () => void;
}

export const RevokeDeviceModal: React.FC<RevokeDeviceModalProps> = ({
  booth,
  isOpen,
  onClose,
  onRevoked,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen || !booth) return null;

  const handleRevoke = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await provisioningApi.revokeDevice(booth.id);
      onRevoked();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal melakukan revocation device.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-500/30 bg-slate-900 shadow-2xl space-y-0 text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-rose-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Emergency Device Revocation</h3>
              <p className="text-xs text-rose-300">Booth: {booth.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/20 text-xs text-rose-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>PERINGATAN TINDAKAN DARURAT</span>
            </div>
            <p className="leading-relaxed">
              Tindakan ini digunakan jika laptop/perangkat kiosk <b>hilang, dicuri, atau disusupi</b>.
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pt-1">
              <li>Kunci kredensial <span className="font-mono text-rose-400">deviceSecret</span> saat ini akan langsung dimusnahkan.</li>
              <li>Status booth akan otomatis dikunci ke <span className="font-bold text-amber-400">MAINTENANCE</span>.</li>
              <li>Perangkat lama tidak akan pernah bisa mengakses backend lagi.</li>
            </ul>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-400">
              Ketik <span className="font-bold text-white font-mono">REVOKE</span> untuk konfirmasi:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="REVOKE"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={isLoading || confirmText !== 'REVOKE'}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
          >
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            Revoke Kredensial Sekarang
          </button>
        </div>
      </div>
    </div>
  );
};
