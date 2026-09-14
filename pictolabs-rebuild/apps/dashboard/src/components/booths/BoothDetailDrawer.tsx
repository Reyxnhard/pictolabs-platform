import React, { useState, useEffect } from 'react';
import { Drawer } from '../common/Drawer';
import { StatusBadge } from '../common/StatusBadge';
import { MaintenanceToggle } from './MaintenanceToggle';
import type { Booth, BoothStatusResponse } from '../../types/booth';
import { boothsApi } from '../../services/boothsApi';
import { CopyButton } from '../common/CopyButton';
import { Monitor, Cpu, GitCommit, HardDrive, Wifi, Shield, RefreshCw, Lock, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { BoothHealthCard } from './BoothHealthCard';
import { BoothProvisioningSection } from './BoothProvisioningSection';

interface BoothDetailDrawerProps {
  booth: Booth | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export const BoothDetailDrawer: React.FC<BoothDetailDrawerProps> = ({
  booth,
  isOpen,
  onClose,
  onStatusUpdated,
}) => {
  const [statusDetail, setStatusDetail] = useState<BoothStatusResponse | null>(null);
  const [detailedBooth, setDetailedBooth] = useState<Booth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // PIN Management State
  const [newPin, setNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    if (!booth) return;
    setIsLoading(true);
    try {
      const [statusData, boothData] = await Promise.all([
        boothsApi.getBoothStatus(booth.id),
        boothsApi.getBoothById(booth.id),
      ]);
      setStatusDetail(statusData);
      setDetailedBooth(boothData);
    } catch (err) {
      console.error('Failed to load booth status detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && booth) {
      fetchStatus();
    } else {
      setStatusDetail(null);
      setDetailedBooth(null);
      setPinFeedback(null);
      setNewPin('');
    }
  }, [isOpen, booth?.id]);


  if (!booth) return null;

  const handleMaintenanceToggle = async (newStatus: 'NORMAL' | 'MAINTENANCE', reason: string) => {
    setIsUpdating(true);
    try {
      await boothsApi.updateBoothStatus(booth.id, { status: newStatus, reason });
      await fetchStatus();
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      console.error('Failed to update maintenance status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const currentManualStatus = statusDetail?.isMaintenance || booth.isMaintenance ? 'MAINTENANCE' : 'NORMAL';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={booth.name}
      subtitle={`Branch: ${booth.branch?.name || 'Unassigned'} • ID: ${booth.id}`}
      width="max-w-xl"
    >
      <div className="space-y-6">
        {/* Status Header */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Operational Connectivity
            </span>
            <div className="flex items-center gap-2.5">
              <StatusBadge
                status={statusDetail?.status || booth.status}
                isMaintenance={statusDetail?.isMaintenance ?? booth.isMaintenance}
                size="lg"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            title="Refresh diagnostics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

        {/* Maintenance Toggle */}
        <MaintenanceToggle
          currentStatus={currentManualStatus}
          onToggle={handleMaintenanceToggle}
          isLoading={isUpdating}
        />

        {/* Hardware Provisioning & Identity */}
        <BoothProvisioningSection
          booth={detailedBooth || booth}
          onRefresh={async () => {
            await fetchStatus();
            if (onStatusUpdated) onStatusUpdated();
          }}
        />

        {/* Kiosk Admin PIN Management */}

        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              Kelola PIN Teknisi (6-Digit Bcrypt)
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Cloud Hash Sync
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            PIN digunakan teknisi untuk membuka Operator Control Panel di layar kios. Hash disimpan aman di backend database.
          </p>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!/^\d{6}$/.test(newPin)) {
                setPinFeedback({ type: 'error', message: 'PIN harus tepat 6 digit angka.' });
                return;
              }
              setIsUpdatingPin(true);
              setPinFeedback(null);
              try {
                await boothsApi.updateBoothPin(booth.id, newPin);
                setPinFeedback({ type: 'success', message: '✓ PIN Teknisi berhasil diubah! Kiosk langsung tersinkron.' });
                setNewPin('');
              } catch (err: any) {
                setPinFeedback({ type: 'error', message: err.response?.data?.message || 'Gagal memperbarui PIN teknisi' });
              } finally {
                setIsUpdatingPin(false);
              }
            }}
            className="space-y-3 pt-1"
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Masukkan 6-digit PIN baru..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-sm tracking-widest placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  title={showPin ? 'Sembunyikan PIN' : 'Lihat PIN'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={isUpdatingPin || newPin.length !== 6}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                {isUpdatingPin ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <KeyRound className="w-3.5 h-3.5" />
                )}
                Simpan PIN
              </button>
            </div>

            {pinFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  pinFeedback.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                }`}
              >
                {pinFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                )}
                <span>{pinFeedback.message}</span>
              </div>
            )}
          </form>
        </div>

        {/* 5-Pillar Operational Health */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
          <BoothHealthCard boothId={booth.id} onRefresh={fetchStatus} />
        </div>

        {/* Heartbeat & Liveness Timing */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-indigo-400" />
            Heartbeat Liveness & Thresholds
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-slate-400 text-[11px]">Last Heartbeat (UTC)</p>
              <p className="font-mono text-slate-200 mt-0.5">
                {booth.lastSeen ? new Date(booth.lastSeen).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : 'Never'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-slate-400 text-[11px]">Heartbeat Age</p>
              <p className="font-mono text-slate-200 mt-0.5">
                {statusDetail?.secondsSinceLastHeartbeat !== null && statusDetail?.secondsSinceLastHeartbeat !== undefined
                  ? `${statusDetail.secondsSinceLastHeartbeat}s ago`
                  : 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1 font-mono">
            <span>Online: &lt;60s</span>
            <span>Degraded: &lt;300s</span>
            <span>Offline: &ge;300s</span>
          </div>
        </div>

        {/* Runtime Specifications */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-purple-400" />
            Runtime Platform Specifications
          </h4>

          <div className="divide-y divide-slate-800/60 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" /> App Version
              </span>
              <span className="font-mono font-semibold text-slate-200">
                {booth.appVersion ? `v${booth.appVersion}` : 'Not reported'}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <GitCommit className="w-3.5 h-3.5" /> Git Commit Hash
              </span>
              <div className="flex items-center gap-2 font-mono text-slate-200">
                <span>{booth.gitCommit || 'N/A'}</span>
                {booth.gitCommit && <CopyButton text={booth.gitCommit} label="" />}
              </div>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" /> Release Channel
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono text-[11px]">
                {booth.releaseChannel || 'stable'}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5" /> Host Machine Name
              </span>
              <span className="font-mono text-slate-200">
                {booth.machineName || 'N/A'}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5" /> Venue LAN IP
              </span>
              <div className="flex items-center gap-2 font-mono text-slate-200">
                <span>{booth.localIp || 'N/A'}</span>
                {booth.localIp && <CopyButton text={booth.localIp} label="" />}
              </div>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">OS Platform</span>
              <span className="text-slate-200 truncate max-w-[220px]">
                {booth.osVersion || 'Windows 11'}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">Electron Runtime</span>
              <span className="font-mono text-slate-200">
                {booth.electronVersion ? `v${booth.electronVersion}` : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Identification & Credentials */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Kiosk Identity
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-slate-400">Booth UUID</span>
              <div className="flex items-center gap-2 font-mono text-slate-300">
                <span className="truncate max-w-[180px]">{booth.id}</span>
                <CopyButton text={booth.id} label="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
