import { useState, useEffect } from 'react';
import {
  Monitor,
  Palette,
  DollarSign,
  Send,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Printer,
  Camera,
  History,
  AlertCircle,
  Activity,
  Cpu,
  Check,
  SlidersHorizontal,
  QrCode,
  ShieldCheck,
  Eye,
  HardDrive
} from 'lucide-react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface Booth {
  id: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | string;
  location: string;
  paperRemaining: number;
  cpuTemp: number;
  lastSeen: string;
}

interface PresetTheme {
  name: string;
  color: string;
  eventName: string;
  subText: string;
  tag: string;
}

const PRESET_THEMES: PresetTheme[] = [
  {
    name: 'Photolab Classic Blue',
    color: '#3b82f6',
    eventName: 'PICTOLABS SELF PHOTOBOOTH',
    subText: 'TOUCH SCREEN TO START',
    tag: 'Popular'
  },
  {
    name: 'Sakura Pastel Pink',
    color: '#ec4899',
    eventName: 'WEDDING OF ALICE & BOB',
    subText: 'SENTUH LAYAR UNTUK BERFOTO',
    tag: 'Romantic'
  },
  {
    name: 'Royal Cyber Violet',
    color: '#8b5cf6',
    eventName: 'NEON NIGHTS PHOTO STUDIO',
    subText: 'TAP TO CAPTURE YOUR VIBE',
    tag: 'Trendy'
  },
  {
    name: 'Emerald Botanical',
    color: '#10b981',
    eventName: 'SUMMER FESTIVAL 2026',
    subText: 'MULAI SESI FOTOMU SEKARANG',
    tag: 'Vibrant'
  },
  {
    name: 'Sunset Amber Gold',
    color: '#f59e0b',
    eventName: 'GOLDEN HOUR PHOTOBOOTH',
    subText: 'TAP ANYWHERE TO CELEBRATE',
    tag: 'Festive'
  },
  {
    name: 'Monochrome Studio',
    color: '#0f172a',
    eventName: 'BLACK & WHITE STUDIO ESSENTIALS',
    subText: 'TOUCH SCREEN TO POSE',
    tag: 'Minimal'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'booths' | 'designer' | 'gallery'>('designer');
  const [isPushing, setIsPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [activePreset, setActivePreset] = useState<string>('Photolab Classic Blue');

  // Booth Telemetry Data
  const [booths, setBooths] = useState<Booth[]>([
    {
      id: 'booth-01',
      name: 'PICTOLABS-DEV-01',
      status: 'ONLINE',
      location: 'Grand Indonesia, West Mall Lt. 3',
      paperRemaining: 480,
      cpuTemp: 44.5,
      lastSeen: 'Just now'
    },
  ]);

  // Visual Customizer State (What user configures online to control Kiosk)
  const [config, setConfig] = useState({
    themeColor: '#3b82f6',
    eventName: 'PICTOLABS SELF PHOTOBOOTH',
    subText: 'TOUCH SCREEN TO START',
    price: 35000,
    countdown: 5,
    enableVoucher: true,
    enableQRIS: true,
    activeLayout: '4R'
  });

  // Connect to Backend WebSocket and fetch Booths
  useEffect(() => {
    let socket: Socket | null = null;

    async function fetchBooths() {
      try {
        const res = await axios.get('http://localhost:4000/booths');
        if (Array.isArray(res.data) && res.data.length > 0) {
          setBooths(
            res.data.map((b: any) => ({
              id: b.id,
              name: b.name,
              status: b.status || 'ONLINE',
              location: b.branch?.name ? `${b.branch.name}, ${b.branch.location}` : 'Grand Indonesia',
              paperRemaining: b.healthLogs?.[0]?.paperCount || 480,
              cpuTemp: b.healthLogs?.[0]?.cpuTemp || 44.2,
              lastSeen: 'Just now'
            }))
          );
        }
      } catch (err) {
        console.warn('[Dashboard] Could not fetch initial booths from backend:', err);
      }
    }

    fetchBooths();

    try {
      socket = io('http://localhost:4000', {
        reconnection: true,
        reconnectionDelay: 2000,
      });

      socket.on('connect', () => {
        setIsBackendConnected(true);
      });

      socket.on('disconnect', () => {
        setIsBackendConnected(false);
      });

      socket.on('booth_status_changed', (data: { boothId: string; name?: string; status: string }) => {
        setBooths((prev) =>
          prev.map((b) => (b.id === data.boothId || b.name === data.name ? { ...b, status: data.status } : b))
        );
      });

      socket.on('booth_telemetry', (data: any) => {
        setBooths((prev) =>
          prev.map((b) =>
            b.id === data.boothId
              ? {
                  ...b,
                  paperRemaining: data.paperCount ?? b.paperRemaining,
                  cpuTemp: data.cpuTemp ?? b.cpuTemp,
                  lastSeen: 'Just now'
                }
              : b
          )
        );
      });
    } catch (e) {
      console.warn('[Dashboard] Socket connection error:', e);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const handlePushConfig = async () => {
    setIsPushing(true);
    setPushError(null);

    try {
      await axios.post('http://localhost:4000/booths/push-config', {
        boothId: 'all',
        config,
      });

      setIsPushing(false);
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 3500);
    } catch (err: any) {
      setIsPushing(false);
      setPushError(
        err.response?.data?.message ||
        'Gagal menghubungi backend di http://localhost:4000. Pastikan backend aktif!'
      );
      setTimeout(() => setPushError(null), 5000);
    }
  };

  const applyPreset = (preset: PresetTheme) => {
    setActivePreset(preset.name);
    setConfig({
      ...config,
      themeColor: preset.color,
      eventName: preset.eventName,
      subText: preset.subText,
    });
  };

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-100 overflow-hidden font-sans select-none antialiased">
      {/* Sidebar: Glassmorphism Bento Navigation */}
      <aside className="w-72 bg-slate-900/60 backdrop-blur-2xl border-r border-slate-800/80 flex flex-col p-6 z-20">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5 mb-10">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-xl shadow-blue-600/30 border border-white/20">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-black text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                PICTOLABS
              </h1>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Cloud Control Center</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          <button
            onClick={() => setActiveTab('designer')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all duration-300 cursor-pointer ${
              activeTab === 'designer'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/30 border border-blue-400/30'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Palette className="w-5 h-5" />
              <span>Visual Customizer</span>
            </div>
            {activeTab === 'designer' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
          </button>

          <button
            onClick={() => setActiveTab('booths')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all duration-300 cursor-pointer ${
              activeTab === 'booths'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/30 border border-blue-400/30'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Monitor className="w-5 h-5" />
              <span>Booth Fleet Status</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              1 Active
            </span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all duration-300 cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/30 border border-blue-400/30'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <History className="w-5 h-5" />
              <span>Cloud Photo Sync</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">300 DPI</span>
          </button>
        </nav>

        {/* Real-time Telemetry Mini Widget */}
        <div className="mt-auto p-4 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/90 border border-slate-800/80 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              Cloud Stream
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
              isBackendConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isBackendConnected ? 'LIVE WS' : 'CONNECTING'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium space-y-1">
            <div className="flex justify-between">
              <span>Target Host:</span>
              <span className="font-mono text-slate-300">localhost:4000</span>
            </div>
            <div className="flex justify-between">
              <span>Kiosk Protocol:</span>
              <span className="font-mono text-emerald-400">IPC + Socket.IO</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-[#030712] relative">
        {/* Ambient Top Glow */}
        <div 
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700"
          style={{ backgroundColor: config.themeColor }}
        />

        {/* Header Bar */}
        <header className="h-20 border-b border-slate-800/80 px-10 flex items-center justify-between backdrop-blur-xl bg-slate-950/40 sticky top-0 z-30">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black tracking-tight">
                {activeTab === 'designer' && 'Visual UI & Event Customizer'}
                {activeTab === 'booths' && 'Hardware Fleet & Telemetry'}
                {activeTab === 'gallery' && '300 DPI Session Cloud Vault'}
              </h2>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                UI/UX PRO MAX
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeTab === 'designer' && 'Ubah tampilan layar & harga booth secara instan tanpa perlu restart aplikasi Kiosk'}
              {activeTab === 'booths' && 'Monitor kesehatan sensor kamera Canon DSLR, sisa kertas, dan temperatur mesin'}
              {activeTab === 'gallery' && 'Audit riwayat foto resolusi cetak 300 DPI dan transaksi'}
            </p>
          </div>

          {activeTab === 'designer' && (
            <div className="flex items-center gap-4">
              {pushError && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-300 text-xs border border-red-500/20 animate-shake">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>{pushError}</span>
                </div>
              )}

              <button
                onClick={handlePushConfig}
                disabled={isPushing}
                className="group relative flex items-center gap-2.5 px-7 py-3 rounded-2xl font-black text-sm tracking-wide text-white shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer disabled:opacity-50 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${config.themeColor}, #4f46e5)`,
                  boxShadow: `0 10px 30px -5px ${config.themeColor}60`
                }}
              >
                {/* Button shine reflection */}
                <div className="absolute inset-0 w-1/2 h-full bg-white/20 skew-x-12 -translate-x-full group-hover:translate-x-300 transition-transform duration-1000" />

                {isPushing ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : pushSuccess ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-bounce" />
                ) : (
                  <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                )}
                <span>
                  {isPushing ? 'Menyiarkan ke Booth...' : pushSuccess ? 'Berhasil Diperbarui Online!' : 'Push to Live Booths'}
                </span>
              </button>
            </div>
          )}
        </header>

        {/* Tab 1: Bento Grid Designer */}
        {activeTab === 'designer' && (
          <div className="p-8 grid grid-cols-12 gap-8 flex-1">
            {/* Left Column: Bento Studio Controls */}
            <div className="col-span-6 space-y-6">
              {/* Card 1: Curated Theme Presets */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/90 p-6 rounded-3xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold tracking-tight">Koleksi Tema Preset Cepat</h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">1-Click Apply</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {PRESET_THEMES.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset)}
                      className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex items-center gap-3 cursor-pointer ${
                        activePreset === preset.name
                          ? 'bg-slate-800/90 border-blue-500 shadow-lg shadow-blue-500/10'
                          : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                      }`}
                    >
                      <div
                        className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                        style={{ backgroundColor: preset.color }}
                      >
                        {activePreset === preset.name && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">{preset.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{preset.tag}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Card 2: Branding & Color Customizer */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/90 p-6 rounded-3xl space-y-5 shadow-xl">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold tracking-tight">Kustomisasi Branding & Teks Layar</h3>
                </div>

                {/* Event Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Judul Acara (Event Name)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Ditampilkan di Layar Sambutan</span>
                  </label>
                  <input
                    type="text"
                    value={config.eventName}
                    onChange={(e) => setConfig({ ...config, eventName: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Contoh: WEDDING OF DIAN & RIZKY"
                  />
                </div>

                {/* Sub Text / Tap Prompt */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Instruksi Sentuh (Tap Prompt)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Tombol Utama</span>
                  </label>
                  <input
                    type="text"
                    value={config.subText}
                    onChange={(e) => setConfig({ ...config, subText: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Contoh: TOUCH SCREEN TO START"
                  />
                </div>

                {/* Primary Theme Color & Custom Color Picker */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300">Warna Tema Utama</label>
                  <div className="flex items-center gap-3">
                    {['#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#0f172a'].map((col) => (
                      <button
                        key={col}
                        onClick={() => {
                          setActivePreset('');
                          setConfig({ ...config, themeColor: col });
                        }}
                        style={{ backgroundColor: col }}
                        className={`w-10 h-10 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex items-center justify-center ${
                          config.themeColor === col ? 'border-white scale-110 shadow-xl' : 'border-transparent hover:scale-105'
                        }`}
                      >
                        {config.themeColor === col && <Check className="w-4 h-4 text-white" />}
                      </button>
                    ))}

                    <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-800">
                      <input
                        type="color"
                        value={config.themeColor}
                        onChange={(e) => {
                          setActivePreset('');
                          setConfig({ ...config, themeColor: e.target.value });
                        }}
                        className="w-10 h-10 rounded-2xl cursor-pointer bg-transparent border-0"
                        title="Pilih warna bebas"
                      />
                      <span className="font-mono text-xs text-slate-400 uppercase">{config.themeColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Pricing & Hardware Flow Rules */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/90 p-6 rounded-3xl space-y-4 shadow-xl">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold tracking-tight">Tarif & Aturan Sesi Foto</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Price */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Harga per Sesi (IDR)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-xs font-bold text-slate-500">Rp</span>
                      <input
                        type="number"
                        step={5000}
                        value={config.price}
                        onChange={(e) => setConfig({ ...config, price: Number(e.target.value) })}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-black text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Countdown Shutter */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Countdown Kamera</label>
                    <select
                      value={config.countdown}
                      onChange={(e) => setConfig({ ...config, countdown: Number(e.target.value) })}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value={3}>3 Detik (Express)</option>
                      <option value={5}>5 Detik (Ideal Rekomendasi)</option>
                      <option value={7}>7 Detik (Santai)</option>
                      <option value={10}>10 Detik (Group)</option>
                    </select>
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="pt-2 grid grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 cursor-pointer">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-blue-400" />
                      Metode QRIS
                    </span>
                    <input
                      type="checkbox"
                      checked={config.enableQRIS}
                      onChange={(e) => setConfig({ ...config, enableQRIS: e.target.checked })}
                      className="rounded accent-blue-600 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 cursor-pointer">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      Kupon Voucher
                    </span>
                    <input
                      type="checkbox"
                      checked={config.enableVoucher}
                      onChange={(e) => setConfig({ ...config, enableVoucher: e.target.checked })}
                      className="rounded accent-blue-600 w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Ultra-Realistic Live Kiosk Simulator Preview */}
            <div className="col-span-6 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-900/40 to-slate-950/80 border border-slate-800/90 rounded-3xl relative overflow-hidden shadow-2xl">
              {/* Studio Backdrop Ring */}
              <div 
                className="absolute w-80 h-80 rounded-full blur-3xl opacity-25 pointer-events-none transition-all duration-700"
                style={{ backgroundColor: config.themeColor }}
              />

              <div className="flex items-center gap-2 mb-6">
                <Eye className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  Live Kiosk Screen Simulator (9:16 Portrait Kiosk)
                </span>
              </div>

              {/* Physical Kiosk Device Chassis Bezel */}
              <div className="w-[360px] h-[640px] bg-slate-950 border-[6px] border-slate-800/90 rounded-[40px] shadow-2xl relative flex flex-col justify-between p-6 overflow-hidden transition-all duration-700">
                {/* Dynamic Screen Gradient Reflection */}
                <div
                  className="absolute inset-0 transition-colors duration-700 pointer-events-none"
                  style={{
                    background: `linear-gradient(180deg, #ffffff 0%, ${config.themeColor}20 45%, ${config.themeColor} 100%)`,
                  }}
                />

                {/* Halftone Dot Overlay */}
                <div 
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                    backgroundSize: '8px 8px'
                  }}
                />

                {/* Top Status Bar Mock */}
                <div className="relative z-10 flex items-center justify-between text-[10px] font-bold text-slate-600 px-2 pt-1">
                  <span>PICTOLABS KIOSK</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    ONLINE
                  </span>
                </div>

                {/* Simulated Content Box */}
                <div className="relative z-10 text-center my-auto flex flex-col items-center">
                  <div 
                    className="w-full bg-white/80 backdrop-blur-md rounded-3xl border-2 border-white shadow-2xl p-6 flex flex-col items-center justify-center transition-all duration-500"
                    style={{
                      boxShadow: `0 20px 40px -10px ${config.themeColor}40`
                    }}
                  >
                    <div 
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-white mb-3 shadow-md transition-colors duration-500"
                      style={{ backgroundColor: config.themeColor }}
                    >
                      📸
                    </div>
                    <h4 
                      className="font-black text-xl tracking-tight leading-snug transition-colors duration-500"
                      style={{ color: config.themeColor }}
                    >
                      {config.eventName}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                      Rp {config.price.toLocaleString('id-ID')} • 300 DPI High Res
                    </p>
                  </div>
                </div>

                {/* Simulated Tap Prompt Button */}
                <div className="relative z-10 pb-2">
                  <div 
                    className="w-full py-4 rounded-full bg-white text-center font-black text-sm tracking-wide uppercase transition-all duration-500 shadow-xl transform"
                    style={{
                      color: config.themeColor,
                      boxShadow: `0 15px 30px -5px ${config.themeColor}60`
                    }}
                  >
                    {config.subText}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Hardware Telemetry Bento Grid */}
        {activeTab === 'booths' && (
          <div className="p-8 space-y-6 flex-1">
            {/* Bento Stats Row */}
            <div className="grid grid-cols-4 gap-5">
              {/* Stat 1: Active Nodes */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Active Kiosks</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">
                    {booths.filter((b) => b.status === 'ONLINE').length}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">● 100% Online</span>
                </div>
              </div>

              {/* Stat 2: Total Prints */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Prints Today</span>
                  <Printer className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">184</span>
                  <span className="text-xs font-bold text-blue-400">300 DPI</span>
                </div>
              </div>

              {/* Stat 3: Paper Gauge */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Thermal Paper</span>
                  <HardDrive className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">480</span>
                  <span className="text-xs font-bold text-slate-400">/ 700 Sisa</span>
                </div>
              </div>

              {/* Stat 4: Hardware Health */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Kamera DSLR</span>
                  <Camera className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-400">Canon EDSDK</span>
                  <span className="text-xs font-bold text-emerald-400">Siap</span>
                </div>
              </div>
            </div>

            {/* Hardware Nodes Table */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
              <div className="px-8 py-5 border-b border-slate-800/80 flex items-center justify-between">
                <h3 className="font-extrabold text-base tracking-tight">Active Hardware Kiosk Fleet</h3>
                <span className="text-xs text-slate-400 font-mono">1 Node Registered</span>
              </div>

              <div className="divide-y divide-slate-800/80">
                {booths.map((booth) => (
                  <div key={booth.id} className="p-8 flex items-center justify-between hover:bg-slate-800/30 transition-all">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-lg text-white">{booth.name}</span>
                        <span className="px-3 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          ● {booth.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium">{booth.location}</p>
                    </div>

                    <div className="flex items-center gap-10">
                      {/* Paper Level */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                          <Printer className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Paper Roll</p>
                          <p className="text-sm font-extrabold text-white">{booth.paperRemaining} lembar</p>
                        </div>
                      </div>

                      {/* CPU Temp */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                          <Cpu className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">CPU Temp</p>
                          <p className="text-sm font-extrabold text-white">{booth.cpuTemp}°C</p>
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveTab('designer')}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
                      >
                        Atur Tampilan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Cloud Photo Sessions Vault */}
        {activeTab === 'gallery' && (
          <div className="p-8 space-y-6 flex-1">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-8 rounded-3xl text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-600/20">
                <History className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-lg text-white">Live Session Cloud Vault Active</h3>
              <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                Semua sesi foto 300 DPI dari mesin Kiosk terenkripsi dan otomatis disinkronkan ke server lokal. Pelanggan dapat memindai QR code di layar cetak untuk mengunduh foto digital ke smartphone mereka.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
