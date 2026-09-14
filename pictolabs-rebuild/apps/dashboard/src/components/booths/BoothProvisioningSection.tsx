import React, { useState } from 'react';
import type { Booth } from '../../types/booth';
import { Laptop, ShieldCheck, ShieldAlert, RefreshCw, Key, History } from 'lucide-react';
import { PairDeviceModal } from './PairDeviceModal';
import { RevokeDeviceModal } from './RevokeDeviceModal';


interface BoothProvisioningSectionProps {
  booth: Booth;
  onRefresh: () => void;
}

export const BoothProvisioningSection: React.FC<BoothProvisioningSectionProps> = ({
  booth,
  onRefresh,
}) => {
  const [isPairOpen, setIsPairOpen] = useState(false);
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const device = booth.device;
  const isPaired = Boolean(device && device.status === 'ACTIVE');
  const isRevoked = Boolean(device && device.status === 'REVOKED');
  const isDecommissioned = Boolean(device && device.status === 'DECOMMISSIONED');
  const tokens = booth.activationTokens || [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Laptop className="w-4 h-4 text-indigo-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Hardware & Device Identity
          </h4>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
            isPaired
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : isRevoked
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              : isDecommissioned
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {isPaired
            ? '● PAIRED (ACTIVE)'
            : isRevoked
            ? '● REVOKED'
            : isDecommissioned
            ? '● DECOMMISSIONED'
            : '○ UNPAIRED'}
        </span>
      </div>


      {/* Current Device Details Card */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-3">
        {device ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Host Machine Name</span>
              <span className="font-mono font-bold text-white">
                {device.hostname || booth.machineName || 'Unknown Hostname'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Machine GUID</span>
              <span className="font-mono text-slate-300 truncate max-w-[220px]">
                {device.machineGuid || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">OS / Platform</span>
              <span className="text-slate-300 truncate max-w-[220px]">
                {device.osVersion || booth.osVersion || 'Windows 11'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Software Version</span>
              <span className="font-mono text-slate-300">
                {device.appVersion ? `v${device.appVersion}` : booth.appVersion ? `v${booth.appVersion}` : '1.2.0'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Paired At</span>
              <span className="font-mono text-slate-300">
                {device.pairedAt ? new Date(device.pairedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Telemetry Heartbeat</span>
              <span className="font-mono text-slate-300">
                {device.lastSeenAt
                  ? new Date(device.lastSeenAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
                  : booth.lastSeen
                  ? new Date(booth.lastSeen).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
                  : 'Belum ada heartbeat'}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Key className="w-3 h-3 text-emerald-400" /> Device Secret
              </span>
              <span className="font-mono text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                ✓ Cryptographically Bound (DPAPI)
              </span>
            </div>
          </div>
        ) : (
          <div className="py-3 text-center space-y-2">
            <p className="text-xs text-slate-400">
              Booth ini belum dipasangkan dengan perangkat laptop/kiosk fisik.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex flex-wrap gap-2">
          {!isPaired ? (
            <button
              type="button"
              onClick={() => {
                setIsSwapMode(false);
                setIsPairOpen(true);
              }}
              className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <ShieldCheck className="w-4 h-4" />
              Pair Physical Device
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsSwapMode(true);
                  setIsPairOpen(true);
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-600/20"
                title="Ganti hardware laptop dengan token baru"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Swap Hardware (Re-Pair)
              </button>
              <button
                type="button"
                onClick={() => setIsRevokeOpen(true)}
                className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5"
                title="Cabut akses perangkat jika dicuri/hilang"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Emergency Revoke
              </button>
            </>
          )}
        </div>
      </div>

      {/* Device History / Audit Trail Toggle */}
      {tokens.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition font-semibold"
          >
            <History className="w-3.5 h-3.5" />
            <span>{showHistory ? 'Sembunyikan Riwayat Pairing' : `Lihat Riwayat Pairing (${tokens.length} token)`}</span>
          </button>

          {showHistory && (
            <div className="mt-2.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2">
              <table className="w-full text-[11px] text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="p-1.5">Waktu</th>
                    <th className="p-1.5">Kode Token</th>
                    <th className="p-1.5">Status</th>
                    <th className="p-1.5">Device GUID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {tokens.map((t) => (
                    <tr key={t.id} className="text-slate-300">
                      <td className="p-1.5 text-slate-400">
                        {new Date(t.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                      </td>
                      <td className="p-1.5 font-bold text-white">{t.token}</td>
                      <td className="p-1.5">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            t.status === 'CONSUMED'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : t.status === 'PENDING'
                              ? 'bg-indigo-500/10 text-indigo-400'
                              : t.status === 'REVOKED'
                              ? 'bg-rose-500/10 text-rose-400'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="p-1.5 text-slate-400 truncate max-w-[120px]">
                        {t.usedByDeviceGuid || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <PairDeviceModal
        booth={booth}
        isOpen={isPairOpen}
        isSwap={isSwapMode}
        onClose={() => setIsPairOpen(false)}
        onPaired={() => {
          onRefresh();
        }}
      />

      <RevokeDeviceModal
        booth={booth}
        isOpen={isRevokeOpen}
        onClose={() => setIsRevokeOpen(false)}
        onRevoked={() => {
          onRefresh();
        }}
      />
    </div>
  );
};
