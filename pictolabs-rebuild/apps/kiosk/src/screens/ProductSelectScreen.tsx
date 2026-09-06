import { useState } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';
import { Sparkles, Check, Film, Camera, Video, Download } from 'lucide-react';

export default function ProductSelectScreen({ navigate, updateSession }: ScreenProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>('photostrip-2r');
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';
  const priceFormatted = (config.price || 35000).toLocaleString('id-ID');

  const handleContinue = () => {
    updateSession({
      productId: 'photostrip-2r',
      productName: 'Photostrip 2R (Dual Strip)',
      frameId: '2R', // Standard 2R strip identifier
    });
    navigate('payment');
  };

  return (
    <div
      className="w-full h-full flex flex-col transition-colors duration-700 select-none relative overflow-hidden"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}12 45%, ${themeColor} 100%)`,
      }}
    >
      {/* Background Halftone Pattern */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#000 1.5px, transparent 1.5px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Top Header */}
      <div className="px-12 pt-8 pb-4 flex items-center justify-between z-10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow-sm"
              style={{ backgroundColor: themeColor }}
            >
              Langkah 1 dari 4
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {config.eventName || 'PICTOLABS SELF PHOTOBOOTH'}
            </span>
          </div>
          <h2 className="font-display text-4xl font-black text-slate-900 tracking-tight">
            PILIH PRODUK FOTO
          </h2>
          <p className="text-slate-500 font-medium text-sm">
            Pilih format foto favoritmu sebelum melakukan pembayaran
          </p>
        </div>

        {/* Pricing Badge */}
        <div className="px-6 py-3 rounded-2xl bg-white/90 backdrop-blur-md shadow-md border border-slate-100 flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">HARGA SESI</span>
          <span className="font-black font-mono text-2xl" style={{ color: themeColor }}>
            Rp {priceFormatted}
          </span>
        </div>
      </div>

      {/* Product Showcase Area */}
      <div className="flex-1 px-12 py-4 flex items-center justify-center z-10 overflow-y-auto">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
          
          {/* Main Hero Card: Photostrip 2R */}
          <div
            onClick={() => setSelectedProduct('photostrip-2r')}
            className={`md:col-span-8 rounded-[36px] p-8 bg-white/95 backdrop-blur-xl border-4 transition-all duration-300 relative cursor-pointer flex flex-col justify-between ${
              selectedProduct === 'photostrip-2r'
                ? 'scale-[1.01] shadow-2xl'
                : 'border-transparent shadow-lg hover:shadow-xl'
            }`}
            style={{
              borderColor: selectedProduct === 'photostrip-2r' ? themeColor : 'transparent',
              boxShadow:
                selectedProduct === 'photostrip-2r'
                  ? `0 25px 50px -12px ${themeColor}40`
                  : undefined,
            }}
          >
            {/* Top Badges */}
            <div className="flex items-center justify-between mb-4">
              <span className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                Paling Populer & Favorit
              </span>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md"
                style={{ backgroundColor: themeColor }}
              >
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
            </div>

            {/* Product Title & Info */}
            <div className="mb-6">
              <h3 className="font-display text-3xl font-black text-slate-900 tracking-tight mb-2">
                PHOTOSTRIP 2R
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed font-medium">
                Format strip Korea legendaris berukuran 5x15 cm. Satu sesi menghasilkan 2 strip identik yang langsung dipotong otomatis oleh printer lab presisi.
              </p>
            </div>

            {/* Benefit Features Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
                >
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-800">2 Lembar Strip 2R</h4>
                  <p className="text-[11px] text-slate-400">Ukuran 5x15 cm per strip</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
                >
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-800">3 Pose Berbeda</h4>
                  <p className="text-[11px] text-slate-400">Jepretan kamera studio HD</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
                >
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-800">Live Photo & GIF</h4>
                  <p className="text-[11px] text-slate-400">Video countdown & looping</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
                >
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-800">QR Softfile Digital</h4>
                  <p className="text-[11px] text-slate-400">Download gratis ke smartphone</p>
                </div>
              </div>
            </div>

            {/* Note alert */}
            <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center gap-2">
              <span>🎨</span>
              <span>Desain & warna bingkai artistik dapat kamu pilih <strong>setelah pembayaran</strong>.</span>
            </div>
          </div>

          {/* Right Column: Interactive Mockup Strip Preview */}
          <div className="md:col-span-4 rounded-[36px] p-6 bg-slate-900 text-white shadow-2xl border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-4 left-4 text-[10px] font-mono tracking-widest text-slate-400 font-black uppercase">
              MOCKUP FORMAT
            </div>

            {/* Dual Photostrip Mockup Visualization */}
            <div className="flex gap-4 items-center justify-center py-4 my-auto">
              {/* Strip 1 */}
              <div className="w-20 bg-white rounded-xl p-2 shadow-2xl flex flex-col gap-1.5 border border-slate-200 transform -rotate-2 hover:rotate-0 transition-transform">
                <div className="w-full aspect-[4/3] bg-slate-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  Pose 1
                </div>
                <div className="w-full aspect-[4/3] bg-slate-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  Pose 2
                </div>
                <div className="w-full aspect-[4/3] bg-slate-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  Pose 3
                </div>
                <div className="mt-1 pt-1 border-t border-slate-200 text-[6px] text-center font-black tracking-widest text-slate-700 font-mono">
                  PICTOLABS
                </div>
              </div>

              {/* Strip 2 */}
              <div className="w-20 bg-white rounded-xl p-2 shadow-2xl flex flex-col gap-1.5 border border-slate-200 transform rotate-2 hover:rotate-0 transition-transform">
                <div className="w-full aspect-[4/3] bg-slate-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  Pose 1
                </div>
                <div className="w-full aspect-[4/3] bg-slate-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  Pose 2
                </div>
                <div className="w-full aspect-[4/3] bg-slate-200 rounded-md overflow-hidden flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  Pose 3
                </div>
                <div className="mt-1 pt-1 border-t border-slate-200 text-[6px] text-center font-black tracking-widest text-slate-700 font-mono">
                  PICTOLABS
                </div>
              </div>
            </div>

            <span className="text-[11px] font-bold text-slate-400 mt-2">
              2x Cetakan Strip Kembar (2R)
            </span>
          </div>

        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="px-12 py-5 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 flex justify-between items-center shadow-lg z-20">
        <button
          onClick={() => navigate('welcome')}
          className="px-8 py-3.5 rounded-2xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer text-sm"
        >
          ← KEMBALI
        </button>

        <button
          onClick={handleContinue}
          style={{
            backgroundColor: themeColor,
            boxShadow: `0 10px 30px -5px ${themeColor}60`,
          }}
          className="px-12 py-4 rounded-2xl font-display font-black text-white text-base tracking-wider transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-2"
        >
          <span>PILIH & LANJUT KE PEMBAYARAN</span>
          <span className="text-xl leading-none">→</span>
        </button>
      </div>
    </div>
  );
}
