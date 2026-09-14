import React, { useState, useEffect } from 'react';
import { provisioningApi } from '../../services/provisioningApi';
import type { GenerateTokenResponse } from '../../services/provisioningApi';
import { QrCode, Copy, Check, RefreshCw, AlertCircle, ShieldCheck, Clock, Laptop } from 'lucide-react';
import type { Booth } from '../../types/booth';
import { boothsApi } from '../../services/boothsApi';


interface PairDeviceModalProps {
  booth?: Booth | null;
  allBooths?: Booth[];
  isOpen: boolean;
  isSwap?: boolean;
  onClose: () => void;
  onPaired: () => void;
}

export const PairDeviceModal: React.FC<PairDeviceModalProps> = ({
  booth,
  allBooths = [],
  isOpen,
  isSwap = false,
  onClose,
  onPaired,
}) => {
  // Selected booth for pairing (either passed prop or chosen in modal)
  const [selectedBoothId, setSelectedBoothId] = useState<string>('');
  const [tokenData, setTokenData] = useState<GenerateTokenResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Newly paired machine details (for success screen)
  const [pairedDetails, setPairedDetails] = useState<{ hostname: string; machineGuid: string } | null>(null);

  // Countdown timer (15 mins)
  const [timeLeft, setTimeLeft] = useState<number>(15 * 60);
  const [pairingStatus, setPairingStatus] = useState<'WAITING' | 'PAIRED' | 'EXPIRED'>('WAITING');

  // Initialize selectedBoothId
  useEffect(() => {
    if (!isOpen) return;
    if (booth?.id) {
      setSelectedBoothId(booth.id);
    } else if (allBooths.length > 0) {
      // Prioritize an unpaired or decommissioned booth
      const unPaired = allBooths.find((b) => !b.device || b.device.status !== 'ACTIVE');
      setSelectedBoothId(unPaired ? unPaired.id : allBooths[0].id);
    }
  }, [isOpen, booth?.id, allBooths]);

  // Generate or Re-pair token when selectedBoothId changes
  useEffect(() => {
    if (!isOpen || !selectedBoothId) return;

    let mounted = true;
    const generate = async () => {
      setIsLoading(true);
      setError(null);
      setPairingStatus('WAITING');
      setPairedDetails(null);
      try {
        const data = isSwap
          ? await provisioningApi.rePairHardware(selectedBoothId)
          : await provisioningApi.generateToken(selectedBoothId, 15);
        if (mounted) {
          setTokenData(data);
          const expiresTime = new Date(data.expiresAt).getTime();
          const remaining = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
          setTimeLeft(remaining || 15 * 60);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.response?.data?.message || 'Gagal membuat token aktivasi.');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    generate();

    return () => {
      mounted = false;
    };
  }, [isOpen, selectedBoothId, isSwap]);

  // Countdown interval
  useEffect(() => {
    if (!isOpen || pairingStatus !== 'WAITING') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPairingStatus('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, pairingStatus]);

  // Realtime Polling check for token consumption / device pairing
  useEffect(() => {
    if (!isOpen || !tokenData?.token || pairingStatus !== 'WAITING' || !selectedBoothId) return;

    const pollInterval = setInterval(async () => {
      try {
        const val = await provisioningApi.validateToken(tokenData.token);
        if (val.reason === 'TOKEN_CONSUMED') {
          // Fetch updated booth to display machine details
          try {
            const updatedBooth = await boothsApi.getBoothById(selectedBoothId);
            if (updatedBooth.device) {
              setPairedDetails({
                hostname: updatedBooth.device.hostname || 'Physical Kiosk',
                machineGuid: updatedBooth.device.machineGuid || 'Confirmed',
              });
            }
          } catch (_) {}

          setPairingStatus('PAIRED');
          clearInterval(pollInterval);
          onPaired();
        } else if (val.reason === 'TOKEN_EXPIRED') {
          setPairingStatus('EXPIRED');
          clearInterval(pollInterval);
        }
      } catch (_) {}
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, tokenData?.token, pairingStatus, selectedBoothId, onPaired]);

  if (!isOpen) return null;

  const activeBooth = (allBooths.find((b) => b.id === selectedBoothId) || booth) as Booth | undefined;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const qrImageUrl = tokenData?.qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
        tokenData.qrPayload
      )}`
    : null;

  const handleCopyCode = () => {
    if (!tokenData?.token) return;
    navigator.clipboard.writeText(tokenData.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl space-y-0 text-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isSwap ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {isSwap ? 'Hardware Swap (Re-Pair Laptop)' : 'Aktivasi Kiosk Baru'}
              </h3>
              <p className="text-xs text-slate-400">
                {activeBooth
                  ? `Booth: ${activeBooth.name} • ${activeBooth.branch?.name || 'Unassigned'}`
                  : 'Pilih booth untuk memulai aktivasi'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Booth Selector (only visible if opened from global CTA or allBooths provided) */}
          {allBooths.length > 0 && !isSwap && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Pilih Booth yang Akan Diaktifkan:
              </label>
              <select
                id="modal-select-booth"
                value={selectedBoothId}
                onChange={(e) => setSelectedBoothId(e.target.value)}
                disabled={isLoading || pairingStatus === 'PAIRED'}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              >
                {allBooths.map((b) => {
                  const isAlreadyPaired = b.device?.status === 'ACTIVE';
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.branch?.name || 'Cabang'}) {isAlreadyPaired ? '[Sudah Terhubung]' : '[Belum Ada Laptop]'}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-xs text-slate-400">Menghubungkan ke secure fleet provisioning...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">Gagal Membuat Token</p>
                <p className="text-xs text-rose-400 mt-0.5">{error}</p>
              </div>
            </div>
          ) : pairingStatus === 'PAIRED' ? (
            <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-bounce">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-white">Kiosk Berhasil Diaktifkan!</h4>
              <p className="text-xs text-slate-400 max-w-sm">
                Perangkat laptop telah berhasil dipasangkan ke booth <b className="text-emerald-400">{activeBooth?.name}</b>. Kredensial telah disimpan aman di ProgramData kiosk.
              </p>
              {pairedDetails && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono space-y-1 text-left w-full max-w-sm">
                  <div>Komputer: <span className="text-white font-bold">{pairedDetails.hostname}</span></div>
                  <div>Machine GUID: <span className="text-slate-400">{pairedDetails.machineGuid}</span></div>
                  <div>Status: <span className="text-emerald-400 font-bold">● ACTIVE & ONLINE</span></div>
                </div>
              )}
            </div>
          ) : pairingStatus === 'EXPIRED' ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Clock className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-white">Token Telah Kedaluwarsa</h4>
              <p className="text-xs text-slate-400 max-w-xs">
                Token berlaku 15 menit. Silakan klik tombol di bawah untuk men-generate token baru.
              </p>
              <button
                type="button"
                onClick={() => setSelectedBoothId(selectedBoothId)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Generate Ulang Token
              </button>
            </div>
          ) : (
            <>
              {/* Instructions Banner */}
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-300 flex items-start gap-2.5">
                <QrCode className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  Buka aplikasi <b>Pictolabs Kiosk</b> pada laptop booth. Arahkan kamera kiosk ke QR code di bawah atau ketik kode aktivasi.
                </span>
              </div>

              {/* QR Code & Code Display */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                {/* QR Display */}
                <div className="p-2.5 rounded-xl bg-white shadow-lg flex-shrink-0">
                  {qrImageUrl ? (
                    <img
                      src={qrImageUrl}
                      alt="Activation QR Code"
                      className="w-44 h-44 object-contain rounded"
                    />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center bg-slate-100 text-slate-400 text-xs font-mono">
                      Generating QR...
                    </div>
                  )}
                </div>

                {/* Token Code & Timer */}
                <div className="space-y-4 text-center sm:text-left">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Kode Aktivasi (8-Karakter)
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-mono font-extrabold text-emerald-400 tracking-wider">
                        {tokenData?.token}
                      </span>
                      <button
                        onClick={handleCopyCode}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Copy code"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Masa Berlaku Token
                    </span>
                    <div className="flex items-center gap-2 mt-1 text-amber-400 font-mono text-sm font-semibold">
                      <Clock className="w-4 h-4" />
                      <span>{timeFormatted}</span>
                    </div>
                  </div>

                  {/* Pulsing indicator */}
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span>Menunggu kiosk scan QR / aktivasi...</span>
                  </div>
                </div>
              </div>

              {/* Security info */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Single-use 256-bit cryptographic handshake token</span>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
          >
            {pairingStatus === 'PAIRED' ? 'Selesai & Tutup' : 'Tutup'}
          </button>
        </div>
      </div>
    </div>
  );
};
