import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer,
  CloudUpload,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Copy,
  Check,
  X,
  FileImage,
  WifiOff,
  RotateCw,
  Scissors,
  Minus,
  Plus,
} from 'lucide-react';
import { kiosk, KioskSessionHistoryItem, KioskSessionHistoryQuery } from '../ipc/bridge';

interface SessionHistorySectionProps {
  isOnline: boolean;
  onShowToast?: (message: string, type: 'success' | 'error') => void;
}

function formatMediaUrl(filePath?: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('data:') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.startsWith('file://') ? normalized : `file:///${normalized.replace(/^\/+/, '')}`;
}

function formatWibTimestamp(isoString: string): { time: string; relative: string; date: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { time: 'N/A', relative: '', date: '' };

    const time = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB';

    const date = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });

    const diffMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
    let relative = '';
    if (diffMinutes < 1) relative = 'Baru saja';
    else if (diffMinutes < 60) relative = `${diffMinutes} mnt lalu`;
    else if (diffMinutes < 1440) relative = `${Math.floor(diffMinutes / 60)} jam lalu`;
    else relative = `${Math.floor(diffMinutes / 1440)} hari lalu`;

    return { time, relative, date };
  } catch {
    return { time: isoString, relative: '', date: '' };
  }
}

function getFilterLabel(filter: string): string {
  switch (filter.toLowerCase()) {
    case 'none':
    case 'original':
      return 'Tanpa Filter';
    case 'bw':
      return 'Black & White';
    case 'sepia':
      return 'Sepia Classic';
    case 'warm':
      return 'Warm Sunset';
    case 'cool':
      return 'Cool Moody';
    case 'vintage':
      return 'Vintage Film';
    default:
      return filter.charAt(0).toUpperCase() + filter.slice(1);
  }
}

function getFrameLabel(frameId: string): string {
  switch (frameId.toUpperCase()) {
    case '2R':
      return '2R Photostrip';
    case '4R':
      return '4R Classic Grid';
    case '6R':
      return '6R Collage Strip';
    default:
      return frameId;
  }
}

export default function SessionHistorySection({ isOnline, onShowToast }: SessionHistorySectionProps) {
  const [sessions, setSessions] = useState<KioskSessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRINT_FAILED' | 'UPLOAD_PENDING' | 'COMPLETED'>('ALL');
  const [selectedSession, setSelectedSession] = useState<KioskSessionHistoryItem | null>(null);

  // Action states
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [reprintCopies, setReprintCopies] = useState<number>(1);
  const [reprintFormat, setReprintFormat] = useState<'2R' | '4R' | null>(null);
  const [forceUploadingId, setForceUploadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Preselect format strictly based on original session's authoritative format when modal opens
  useEffect(() => {
    if (selectedSession) {
      const orig = selectedSession.originalFormat;
      if (orig === '2R' || orig === '4R') {
        setReprintFormat(orig);
      } else {
        // Unknown or ambiguous format: never silently default to 2R or 4R
        setReprintFormat(null);
      }
      setReprintCopies(1);
    }
  }, [selectedSession]);

  // Load session history from SQLite via IPC
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const query: KioskSessionHistoryQuery = {
        limit: 50,
        statusFilter,
      };
      const data = await kiosk.sessionHistory?.list(query);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('[SessionHistorySection] Error loading sessions:', err);
      onShowToast?.(`Gagal membaca riwayat sesi: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, onShowToast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Aggregate KPI metrics
  const stats = useMemo(() => {
    const total = sessions.length;
    let printedSuccess = 0;
    let printFailed = 0;
    let uploadPending = 0;

    for (const s of sessions) {
      if (s.printStatus === 'COMPLETED' || s.printStatus === 'printed') printedSuccess++;
      if (s.printStatus === 'FAILED' || s.printStatus === 'failed') printFailed++;
      if (s.uploadStatus !== 'COMPLETED') uploadPending++;
    }

    return { total, printedSuccess, printFailed, uploadPending };
  }, [sessions]);

  // Handle Reprint Action
  const handleReprint = async (
    session: KioskSessionHistoryItem,
    copies: number = 1,
    format?: '2R' | '4R' | null
  ) => {
    // Validate copies (positive integer between 1 and 10)
    const cleanCopies = Math.floor(Number(copies));
    if (isNaN(cleanCopies) || cleanCopies < 1 || cleanCopies > 10) {
      const msg = 'Jumlah salinan cetak tidak valid. Masukkan angka bulat antara 1 dan 10.';
      setActionNotice({ text: msg, type: 'error' });
      onShowToast?.(msg, 'error');
      return;
    }

    // Determine target format: explicit parameter -> reprintFormat
    const targetFormat = format || reprintFormat;
    if (!targetFormat || (targetFormat !== '2R' && targetFormat !== '4R')) {
      const msg = 'Format cetak belum dipilih atau tidak valid. Harap pilih 2R (Cut) atau 4R (Uncut) terlebih dahulu.';
      setActionNotice({ text: msg, type: 'error' });
      onShowToast?.(msg, 'error');
      return;
    }

    // Pruned & Offline check
    if (!session.compositeExists && !isOnline) {
      const msg = 'Tidak dapat mencetak: File fisik di SSD telah dibersihkan oleh sistem retensi dan kiosk sedang offline (tidak dapat mengunduh dari cloud).';
      setActionNotice({ text: msg, type: 'error' });
      onShowToast?.(msg, 'error');
      return;
    }

    setReprintingId(session.id);
    setActionNotice(null);

    try {
      const res = await kiosk.sessionHistory?.reprint({
        sessionId: session.id,
        copies: cleanCopies,
        format: targetFormat,
        reason: 'OPERATOR_LOCAL_REPRINT',
      });

      if (res && res.success) {
        const formatLabel = targetFormat === '2R' ? '2R (Cut)' : '4R (Uncut)';
        const msg = `✓ Cetak ulang ${cleanCopies} lembar [${formatLabel}] berhasil dimasukkan ke antrean printer (Job: ${res.printJobId || 'Active'}).`;
        setActionNotice({ text: msg, type: 'success' });
        onShowToast?.(msg, 'success');
        // Refresh local session list to reflect new printing status
        setTimeout(() => loadSessions(), 800);
      } else {
        const err = res?.error || 'Gagal mengirim tugas cetak ulang ke spooler.';
        setActionNotice({ text: err, type: 'error' });
        onShowToast?.(err, 'error');
      }
    } catch (err: any) {
      const errText = err.message || 'Terjadi kesalahan sistem saat mencetak ulang.';
      setActionNotice({ text: errText, type: 'error' });
      onShowToast?.(errText, 'error');
    } finally {
      setReprintingId(null);
    }
  };

  // Handle Force Upload Action
  const handleForceUpload = async (sessionId: string) => {
    setForceUploadingId(sessionId);
    setActionNotice(null);

    try {
      const res = await kiosk.sessionHistory?.forceUpload({ sessionId });
      if (res && res.success) {
        const msg = `✓ Pengunggahan ulang dipicu: ${res.enqueuedCount} berkas media berhasil dimasukkan kembali ke antrean upload.`;
        setActionNotice({ text: msg, type: 'success' });
        onShowToast?.(msg, 'success');
        setTimeout(() => loadSessions(), 800);
      } else {
        const err = res?.error || 'Gagal memicu pengunggahan ulang.';
        setActionNotice({ text: err, type: 'error' });
        onShowToast?.(err, 'error');
      }
    } catch (err: any) {
      const errText = err.message || 'Kesalahan saat memaksa pengunggahan.';
      setActionNotice({ text: errText, type: 'error' });
      onShowToast?.(errText, 'error');
    } finally {
      setForceUploadingId(null);
    }
  };

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl w-full mx-auto animate-fade-in select-none">
      {/* Offline Status Notice Banner */}
      {!isOnline && (
        <div className="bg-amber-950/70 border border-amber-500/50 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wider">
                Mode Offline Aktif (Zero Internet)
              </h4>
              <p className="text-xs text-amber-300/90 mt-0.5">
                Riwayat sesi dan cetak ulang aset HOT tetap beroperasi 100% normal dari penyimpanan lokal SQLite & SSD.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold">
            LOCAL STORAGE ONLY
          </span>
        </div>
      )}

      {/* Top Operational Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Sesi Terdaftar</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats.total}</div>
          <span className="text-[10px] text-slate-500 mt-1">Maks. 50 transaksi terakhir</span>
        </div>

        {/* Print Success Rate */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Tercetak Sukses</span>
            <Printer className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{stats.printedSuccess}</div>
          <span className="text-[10px] text-slate-500 mt-1">Status spooler COMPLETED</span>
        </div>

        {/* Print Failed */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Kendala Cetak</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{stats.printFailed}</div>
          <span className="text-[10px] text-slate-500 mt-1">Perlu tindakan operator / reprint</span>
        </div>

        {/* Upload Queue Pending */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>Antrean Cloud</span>
            <CloudUpload className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">{stats.uploadPending}</div>
          <span className="text-[10px] text-slate-500 mt-1">Menunggu unggah / retrying</span>
        </div>
      </div>

      {/* Action Toast Notice */}
      {actionNotice && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-lg ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Control Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Semua Sesi ({sessions.length})
          </button>
          <button
            onClick={() => setStatusFilter('PRINT_FAILED')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'PRINT_FAILED'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-slate-800 text-slate-400 hover:text-rose-300 hover:bg-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Masalah Cetak
          </button>
          <button
            onClick={() => setStatusFilter('UPLOAD_PENDING')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'UPLOAD_PENDING'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-700'
            }`}
          >
            <CloudUpload className="w-3.5 h-3.5" />
            Pending Upload
          </button>
        </div>

        <button
          onClick={loadSessions}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Segarkan Data
        </button>
      </div>

      {/* Session Cards Feed */}
      {isLoading && sessions.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RotateCw className="w-8 h-8 text-blue-400 animate-spin" />
          <span className="text-sm font-semibold text-slate-300">Membaca riwayat sesi dari SQLite...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <FileImage className="w-10 h-10 text-slate-600" />
          <h4 className="text-base font-bold text-slate-300">Belum Ada Sesi</h4>
          <p className="text-xs text-slate-500 max-w-sm">
            Tidak ditemukan sesi yang sesuai dengan kriteria filter saat ini. Lakukan sesi foto baru pada Kiosk untuk mencatat data transaksi.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((session) => {
            const timeInfo = formatWibTimestamp(session.createdAt);
            const isReprintingThis = reprintingId === session.id;

            return (
              <div
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-4 shadow-xl flex gap-4 transition-all duration-200 cursor-pointer hover:bg-slate-850 group relative overflow-hidden"
              >
                {/* Composite Thumbnail Box */}
                <div className="w-24 h-36 bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                  {session.compositeExists && session.compositePath ? (
                    <img
                      src={formatMediaUrl(session.compositePath)}
                      alt={`Sesi ${session.id}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-center p-2 flex flex-col items-center gap-1 text-slate-600">
                      <FileImage className="w-6 h-6" />
                      <span className="text-[9px] font-mono uppercase font-bold text-slate-500">
                        {session.localStorageState === 'PRUNED' ? 'Cloud Only' : 'No Image'}
                      </span>
                    </div>
                  )}

                  {/* Thumbnail Badge (Frame Layout) */}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white font-mono text-[9px] font-bold">
                    {session.frameId}
                  </span>
                </div>

                {/* Session Card Info */}
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div>
                    {/* Header: ID + Time */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-200 truncate">
                        <span className="truncate">{session.id}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyId(session.id, e)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                          title="Salin ID Sesi"
                        >
                          {copiedId === session.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400 shrink-0">
                        {timeInfo.time}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2.5">
                      <span>{timeInfo.date}</span>
                      <span>•</span>
                      <span className="text-slate-400">{timeInfo.relative}</span>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {/* Frame Layout Badge */}
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-700/60">
                        <Layers className="w-3 h-3 text-blue-400" />
                        {getFrameLabel(session.frameId)}
                      </span>

                      {/* Filter LUT Badge */}
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-700/60">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        {getFilterLabel(session.filter)}
                      </span>
                    </div>

                    {/* Operational Status Badges */}
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                      {/* Print Status */}
                      <span
                        className={`px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          session.printStatus === 'COMPLETED' || session.printStatus === 'printed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : session.printStatus === 'PRINTING'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                            : session.printStatus === 'FAILED' || session.printStatus === 'failed'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : session.printStatus === 'NOT_QUEUED'
                            ? 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        <Printer className="w-3 h-3" />
                        {session.printStatus === 'COMPLETED' || session.printStatus === 'printed'
                          ? 'DIKIRIM KE PRINTER'
                          : session.printStatus === 'PRINTING'
                          ? 'SEDANG MENGIRIM'
                          : session.printStatus === 'FAILED' || session.printStatus === 'failed'
                          ? 'GAGAL CETAK'
                          : session.printStatus === 'NOT_QUEUED'
                          ? 'BELUM DIANTREKAN'
                          : 'MENUNGGU CETAK'}
                      </span>

                      {/* Upload Status */}
                      <span
                        className={`px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          session.uploadStatus === 'COMPLETED' || session.uploaded
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : session.uploadStatus === 'UPLOADING'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                            : session.uploadStatus === 'FAILED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        <CloudUpload className="w-3 h-3" />
                        {session.uploadStatus === 'COMPLETED' || session.uploaded
                          ? 'TERSINKRON'
                          : session.uploadStatus === 'UPLOADING'
                          ? 'MENGUNGGAH'
                          : session.uploadStatus === 'FAILED'
                          ? 'GAGAL UNGGAH'
                          : 'PENDING UNGGAH'}
                      </span>

                      {/* Storage State Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full border flex items-center gap-1 font-mono ${
                          session.localStorageState === 'HOT'
                            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                            : session.localStorageState === 'PRUNED'
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-red-950/40 text-red-400 border-red-800/40'
                        }`}
                      >
                        <HardDrive className="w-3 h-3" />
                        {session.localStorageState === 'HOT'
                          ? 'HOT: SSD SIAP'
                          : session.localStorageState === 'PRUNED'
                          ? 'PRUNED: CLOUD'
                          : 'EVICTED'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Card Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/60 mt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSession(session);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors py-1 cursor-pointer"
                    >
                      Detail & Preview →
                    </button>

                    <button
                      type="button"
                      disabled={isReprintingThis || (!session.compositeExists && !isOnline)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (session.originalFormat === '2R' || session.originalFormat === '4R') {
                          handleReprint(session, 1, session.originalFormat);
                        } else {
                          // Unknown format: open detail modal and require explicit selection
                          setSelectedSession(session);
                          setActionNotice({
                            text: 'Format asli sesi ini tidak diketahui. Harap pilih 2R (Cut) atau 4R (Uncut) secara manual di detail sesi.',
                            type: 'error',
                          });
                          onShowToast?.(
                            'Format asli sesi ini tidak diketahui. Harap pilih 2R (Cut) atau 4R (Uncut) secara manual di detail sesi.',
                            'error'
                          );
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        !session.compositeExists && !isOnline
                          ? 'bg-slate-800 text-slate-500'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30'
                      }`}
                      title={
                        !session.compositeExists && !isOnline
                          ? 'File fisik tidak ada di SSD & Kiosk sedang offline'
                          : session.originalFormat === '2R' || session.originalFormat === '4R'
                          ? `Cetak Ulang Langsung (${session.originalFormat === '2R' ? '2R Cut' : '4R Uncut'})`
                          : 'Pilih Format di Detail Sesi'
                      }
                    >
                      <Printer className={`w-3.5 h-3.5 ${isReprintingThis ? 'animate-spin' : ''}`} />
                      {isReprintingThis
                        ? 'Memproses...'
                        : !session.compositeExists && !isOnline
                        ? 'Offline & Diprune'
                        : session.originalFormat === '2R' || session.originalFormat === '4R'
                        ? 'Cetak Ulang'
                        : 'Pilih Format'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session Detail Modal / Observability Drawer */}
      {selectedSession && (
        <div className="fixed inset-0 z-70 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8 select-none animate-fade-in">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                  <FileImage className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    Detail & Observasi Sesi
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span>{selectedSession.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedSession.id)}
                      className="text-slate-500 hover:text-slate-200 transition-colors"
                      title="Salin ID"
                    >
                      {copiedId === selectedSession.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-6">
              {/* Left Column: Composite High-Res Image Preview */}
              <div className="w-full md:w-5/12 flex flex-col items-center">
                <div className="w-full aspect-[2/3] max-w-[280px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center shadow-lg relative">
                  {selectedSession.compositeExists && selectedSession.compositePath ? (
                    <img
                      src={formatMediaUrl(selectedSession.compositePath)}
                      alt={`Full Composite ${selectedSession.id}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-500 flex flex-col items-center gap-2">
                      <FileImage className="w-12 h-12 text-slate-700" />
                      <span className="font-bold text-xs text-slate-400">Aset Telah Dipruning</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        File lokal telah dibersihkan oleh siklus retensi 7-hari SSD.
                      </p>
                    </div>
                  )}

                  {/* Overlay Frame Badge */}
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-white font-mono text-xs font-bold">
                    {selectedSession.frameId} • {getFilterLabel(selectedSession.filter)}
                  </span>
                </div>

                {/* Local Storage Indicator */}
                <div className="w-full max-w-[280px] mt-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">Status SSD:</span>
                    <span
                      className={`font-mono font-bold ${
                        selectedSession.compositeExists ? 'text-cyan-400' : 'text-amber-400'
                      }`}
                    >
                      {selectedSession.localStorageState === 'HOT'
                        ? 'HOT (Tersedia)'
                        : selectedSession.localStorageState === 'PRUNED'
                        ? 'PRUNED (Cloud Only)'
                        : 'EVICTED'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate" title={selectedSession.compositePath}>
                    {selectedSession.compositePath || 'Path tidak tercatat'}
                  </div>
                </div>
              </div>

              {/* Right Column: Complete Lifecycle Diagnostics & Action Buttons */}
              <div className="w-full md:w-7/12 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  {/* Print Diagnostics Card */}
                  <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <Printer className="w-4 h-4 text-purple-400" />
                        Status Pencetakan Spooler
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                          selectedSession.printStatus === 'COMPLETED' || selectedSession.printStatus === 'printed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : selectedSession.printStatus === 'PRINTING'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                            : selectedSession.printStatus === 'FAILED' || selectedSession.printStatus === 'failed'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : selectedSession.printStatus === 'NOT_QUEUED'
                            ? 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {selectedSession.printStatus === 'NOT_QUEUED' ? 'NOT_QUEUED (Belum Diantrekan)' : selectedSession.printStatus}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Percobaan Spooler:</span>
                      <span className="font-mono text-slate-200">
                        {selectedSession.printAttempts} / 5
                        {selectedSession.printAttempts > 5 && (
                          <span className="text-rose-400 font-semibold ml-1.5">— melebihi batas retry</span>
                        )}
                      </span>
                    </div>

                    {selectedSession.lastPrintError && (
                      <div className="text-[11px] bg-rose-950/50 border border-rose-500/40 rounded-xl p-2 text-rose-300">
                        <span className="font-bold">Error Terakhir:</span> {selectedSession.lastPrintError}
                      </div>
                    )}
                  </div>

                  {/* Upload Diagnostics Card */}
                  <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <CloudUpload className="w-4 h-4 text-blue-400" />
                        Status Sinkronisasi Cloud (R2)
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                          selectedSession.uploadStatus === 'COMPLETED' || selectedSession.uploaded
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : selectedSession.uploadStatus === 'UPLOADING'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                            : selectedSession.uploadStatus === 'FAILED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {selectedSession.uploadStatus}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Percobaan Unggah:</span>
                      <span className="font-mono text-slate-200">
                        {selectedSession.uploadAttempts} / 5
                        {selectedSession.uploadAttempts > 5 && (
                          <span className="text-rose-400 font-semibold ml-1.5">— melebihi batas retry</span>
                        )}
                      </span>
                    </div>

                    {selectedSession.lastUploadError && (
                      <div className="text-[11px] bg-rose-950/50 border border-rose-500/40 rounded-xl p-2 text-rose-300">
                        <span className="font-bold">Error Unggah:</span> {selectedSession.lastUploadError}
                      </div>
                    )}

                    {selectedSession.remoteUrl && (
                      <div className="text-[11px] text-slate-400 truncate">
                        <span className="font-semibold text-slate-300">Remote CDN:</span>{' '}
                        <span className="font-mono text-blue-400">{selectedSession.remoteUrl}</span>
                      </div>
                    )}
                  </div>

                  {/* Session Context Timestamps */}
                  <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Waktu Pembuatan:
                      </span>
                      <span className="font-mono text-slate-200">
                        {formatWibTimestamp(selectedSession.createdAt).time} ({selectedSession.createdAt.slice(0, 10)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Jumlah Foto Mentah:</span>
                      <span className="font-mono text-slate-200">{selectedSession.photoCount} foto</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Klip Live Photo:</span>
                      <span className="font-mono text-slate-200">{selectedSession.hasVideo ? 'Tersedia' : 'Tidak Ada'}</span>
                    </div>
                  </div>
                </div>

                {/* Pruned Offline Warning Banner */}
                {!selectedSession.compositeExists && !isOnline && (
                  <div className="bg-rose-950/80 border border-rose-500/50 rounded-2xl p-3.5 text-rose-200 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>
                      Pencetakan dinonaktifkan: Aset SSD telah dipruning dan booth sedang offline sehingga tidak dapat mengunduh ulang dari cloud.
                    </span>
                  </div>
                )}

                {/* Action Controls */}
                <div className="space-y-3 pt-2">
                  {/* Format Selector Bar */}
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                        <Printer className="w-3.5 h-3.5 text-blue-400" />
                        Pilih Format Cetak:
                      </span>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-slate-400">
                          Format Asli:{' '}
                          <strong className={selectedSession.originalFormat ? 'text-cyan-300' : 'text-amber-400 font-bold'}>
                            {selectedSession.originalFormat
                              ? `${selectedSession.originalFormat} ${selectedSession.originalFormat === '2R' ? '(Cut)' : '(Uncut)'}`
                              : 'Tidak diketahui'}
                          </strong>
                        </span>
                        {selectedSession.printFormat && selectedSession.printFormat !== selectedSession.originalFormat && (
                          <span className="text-purple-400">
                            (Terakhir: {selectedSession.printFormat})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actionable Warning Banner when original format is unknown */}
                    {!selectedSession.originalFormat && (
                      <div className="mb-2.5 p-2.5 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-[11px] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Format asli sesi ini tidak diketahui. Harap pilih 2R (Cut) atau 4R (Uncut) secara manual sebelum mencetak.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReprintFormat('2R')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                          reprintFormat === '2R'
                            ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                            2R (Cut)
                          </span>
                          {selectedSession.originalFormat === '2R' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                              Asli
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Dua strip 2×6 inci (pisau aktif)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReprintFormat('4R')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                          reprintFormat === '4R'
                            ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-purple-400" />
                            4R (Uncut)
                          </span>
                          {selectedSession.originalFormat === '4R' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                              Asli
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Satu lembar 4×6 inci (tanpa potong)
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Separate Numeric Copy Count Control */}
                  <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                    <div>
                      <span className="text-xs text-slate-300 font-bold block">
                        Jumlah Salinan Cetak:
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Maksimal 10 salinan per cetak ulang
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={reprintCopies <= 1}
                        onClick={() => setReprintCopies((c) => Math.max(1, c - 1))}
                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                        title="Kurangi Salinan"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={reprintCopies}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setReprintCopies(Math.max(1, Math.min(10, val)));
                          }
                        }}
                        className="w-12 h-8 text-center bg-slate-900 border border-slate-700 rounded-xl text-white font-mono font-bold text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        disabled={reprintCopies >= 10}
                        onClick={() => setReprintCopies((c) => Math.min(10, c + 1))}
                        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                        title="Tambah Salinan"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-semibold text-slate-400 pl-1">Lembar</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Reprint Button */}
                    <button
                      type="button"
                      disabled={
                        !reprintFormat ||
                        reprintingId === selectedSession.id ||
                        (!selectedSession.compositeExists && !isOnline) ||
                        reprintCopies < 1 ||
                        reprintCopies > 10
                      }
                      onClick={() => handleReprint(selectedSession, reprintCopies, reprintFormat)}
                      className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                    >
                      <Printer className={`w-4 h-4 ${reprintingId === selectedSession.id ? 'animate-spin' : ''}`} />
                      {reprintingId === selectedSession.id
                        ? 'Memproses Cetak...'
                        : !reprintFormat
                        ? 'Pilih Format Cetak Terlebih Dahulu'
                        : `Cetak Ulang (${reprintFormat === '2R' ? '2R Cut' : '4R Uncut'} • ${reprintCopies}x)`}
                    </button>

                    {/* Force Upload Button */}
                    <button
                      type="button"
                      disabled={forceUploadingId === selectedSession.id}
                      onClick={() => handleForceUpload(selectedSession.id)}
                      className="py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
                    >
                      <CloudUpload className={`w-4 h-4 ${forceUploadingId === selectedSession.id ? 'animate-spin' : ''}`} />
                      {forceUploadingId === selectedSession.id ? 'Mengantrekan...' : 'Paksa Unggah Ulang'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
