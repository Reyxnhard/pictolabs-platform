import { useState } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';
import { Sparkles, Check, Palette } from 'lucide-react';

export interface FrameDesignOption {
  id: string;
  name: string;
  subtitle: string;
  theme: 'white' | 'black' | 'pastel' | 'y2k' | 'sakura' | 'neon';
  bgStyle: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  desc: string;
  badge?: string;
}

export const FRAME_DESIGNS: FrameDesignOption[] = [
  {
    id: 'classic-white',
    name: 'Minimalist Studio',
    subtitle: 'Clean White Frame',
    theme: 'white',
    bgStyle: '#ffffff',
    borderColor: '#e2e8f0',
    textColor: '#0f172a',
    accentColor: '#3b82f6',
    desc: 'Frame putih bersih khas studio Korea dengan tipografi minimalis modern.',
    badge: 'Populer',
  },
  {
    id: 'noir-black',
    name: 'Cinematic Noir',
    subtitle: 'Midnight Black Frame',
    theme: 'black',
    bgStyle: '#090d16',
    borderColor: '#1e293b',
    textColor: '#f8fafc',
    accentColor: '#fbbf24',
    desc: 'Nuansa hitam pekat premium studio, kontras tajam nan artistik.',
    badge: 'Favorit',
  },
  {
    id: 'pastel-lilac',
    name: 'Pastel Dream',
    subtitle: 'Soft Lilac & Sky',
    theme: 'pastel',
    bgStyle: 'linear-gradient(180deg, #f3e8ff 0%, #dbeafe 100%)',
    borderColor: '#c084fc',
    textColor: '#581c87',
    accentColor: '#a855f7',
    desc: 'Gradasi pastel ungu lilac lembut dengan aura hangat dan ceria.',
  },
  {
    id: 'y2k-chrome',
    name: 'Retro Y2K',
    subtitle: 'Chrome Stars & Silver',
    theme: 'y2k',
    bgStyle: 'linear-gradient(180deg, #f1f5f9 0%, #cbd5e1 100%)',
    borderColor: '#64748b',
    textColor: '#0f172a',
    accentColor: '#0284c7',
    desc: 'Aksen futuristik metalik 2000-an dengan aksen bintang retro.',
  },
  {
    id: 'sakura-blossom',
    name: 'Sakura Blossom',
    subtitle: 'Floral Pink Aesthetic',
    theme: 'sakura',
    bgStyle: 'linear-gradient(180deg, #fdf2f8 0%, #fce7f3 100%)',
    borderColor: '#f472b6',
    textColor: '#831843',
    accentColor: '#ec4899',
    desc: 'Sentuhan kelopak bunga sakura merah muda yang manis dan estetik.',
  },
  {
    id: 'cyber-neon',
    name: 'Cyberpunk Neon',
    subtitle: 'Glow Cyan & Violet',
    theme: 'neon',
    bgStyle: 'linear-gradient(180deg, #0d0614 0%, #1f0836 100%)',
    borderColor: '#a855f7',
    textColor: '#38bdf8',
    accentColor: '#06b6d4',
    desc: 'Garis neon bercahaya futuristik ala distrik malam kota Tokyo.',
  },
];

import { kiosk } from '../ipc/bridge';

export default function FrameDesignScreen({ navigate, updateSession, session }: ScreenProps) {
  const [selectedId, setSelectedId] = useState<string>('classic-white');
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';
  const selectedDesign = FRAME_DESIGNS.find((d) => d.id === selectedId) || FRAME_DESIGNS[0];

  const handleStartCapture = () => {
    updateSession({
      frameDesignId: selectedDesign.id,
      frameDesignName: selectedDesign.name,
      frameDesignTheme: selectedDesign.theme,
      frameDesignBorderColor: selectedDesign.borderColor,
    });

    if (session?.sessionId) {
      kiosk.recovery?.checkpoint?.(session.sessionId, 'FRAME_SELECTED', 0, {
        frameDesignId: selectedDesign.id,
        frameDesignName: selectedDesign.name,
        frameDesignTheme: selectedDesign.theme,
        frameDesignBorderColor: selectedDesign.borderColor,
      }).catch(() => {});
    }

    navigate('capture');
  };

  return (
    <div
      className="w-full h-full flex flex-col transition-colors duration-700 select-none relative overflow-hidden"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}15 45%, ${themeColor} 100%)`,
      }}
    >
      {/* Background Halftone */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#000 1.5px, transparent 1.5px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Top Header */}
      <div className="px-12 pt-8 pb-3 flex items-center justify-between z-10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow-sm"
              style={{ backgroundColor: themeColor }}
            >
              Langkah 2 dari 4 (Pembayaran Selesai ✓)
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {config.eventName || 'PICTOLABS STUDIO'}
            </span>
          </div>
          <h2 className="font-display text-4xl font-black text-slate-900 tracking-tight">
            PILIH DESAIN FRAME PHOTOSTRIP
          </h2>
          <p className="text-slate-500 font-medium text-sm">
            Tentukan tema bingkai favoritmu untuk sesi Photostrip 2R (3 Pose)
          </p>
        </div>

        {/* Selected Summary Pill */}
        <div className="px-6 py-2.5 rounded-2xl bg-white/90 backdrop-blur-md shadow-md border border-slate-100 flex items-center gap-2.5">
          <Palette className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500">TEMA TERPILIH:</span>
          <span className="font-black text-slate-800 text-sm">{selectedDesign.name}</span>
        </div>
      </div>

      {/* Main Content Area: Grid Options + Live Interactive Mockup */}
      <div className="flex-1 px-12 py-3 flex gap-8 items-center z-10 overflow-hidden">
        
        {/* Left: Design Selection Bento Grid */}
        <div className="flex-1 h-full overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            {FRAME_DESIGNS.map((design) => {
              const isSelected = selectedId === design.id;
              return (
                <button
                  key={design.id}
                  onClick={() => setSelectedId(design.id)}
                  className={`rounded-3xl p-5 text-left transition-all duration-300 relative overflow-hidden cursor-pointer border-4 flex flex-col justify-between ${
                    isSelected
                      ? 'scale-[1.02] shadow-2xl bg-white'
                      : 'bg-white/80 hover:bg-white border-transparent shadow-md hover:shadow-xl'
                  }`}
                  style={{
                    borderColor: isSelected ? themeColor : 'transparent',
                    boxShadow: isSelected ? `0 15px 35px -10px ${themeColor}40` : undefined,
                  }}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-3 w-full">
                    {/* Theme Swatch Preview Circle */}
                    <div
                      className="w-10 h-10 rounded-2xl shadow-md border border-black/10 flex items-center justify-center text-xs font-bold"
                      style={{
                        background: design.bgStyle,
                        color: design.textColor,
                      }}
                    >
                      2R
                    </div>

                    {design.badge && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        {design.badge}
                      </span>
                    )}

                    {isSelected && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md ml-auto"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  {/* Title & Desc */}
                  <div>
                    <h3 className="font-display font-black text-slate-800 text-lg mb-0.5">
                      {design.name}
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold mb-2">
                      {design.subtitle}
                    </p>
                    <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2">
                      {design.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Real-time Live Photostrip Mockup Viewer */}
        <div className="w-80 h-full bg-slate-900/95 backdrop-blur-xl rounded-[36px] p-6 text-white shadow-2xl border border-white/10 flex flex-col items-center justify-between flex-shrink-0">
          <div className="w-full flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest text-slate-400 font-black uppercase flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              LIVE STRIP PREVIEW
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              Photostrip 2R
            </span>
          </div>

          {/* Dynamic Photostrip Mockup */}
          <div className="my-auto py-2">
            <div
              className="w-36 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 transition-all duration-500 border"
              style={{
                background: selectedDesign.bgStyle,
                borderColor: selectedDesign.borderColor,
                boxShadow: `0 20px 40px -10px ${selectedDesign.borderColor}60`,
              }}
            >
              {/* Pose Slot 1 */}
              <div
                className="w-full aspect-[4/3] rounded-lg overflow-hidden flex items-center justify-center text-[10px] font-bold shadow-inner border border-black/5"
                style={{
                  backgroundColor: selectedDesign.theme === 'black' || selectedDesign.theme === 'neon' ? '#1e293b' : '#f1f5f9',
                  color: selectedDesign.textColor,
                }}
              >
                📸 Pose 1
              </div>

              {/* Pose Slot 2 */}
              <div
                className="w-full aspect-[4/3] rounded-lg overflow-hidden flex items-center justify-center text-[10px] font-bold shadow-inner border border-black/5"
                style={{
                  backgroundColor: selectedDesign.theme === 'black' || selectedDesign.theme === 'neon' ? '#1e293b' : '#f1f5f9',
                  color: selectedDesign.textColor,
                }}
              >
                📸 Pose 2
              </div>

              {/* Pose Slot 3 */}
              <div
                className="w-full aspect-[4/3] rounded-lg overflow-hidden flex items-center justify-center text-[10px] font-bold shadow-inner border border-black/5"
                style={{
                  backgroundColor: selectedDesign.theme === 'black' || selectedDesign.theme === 'neon' ? '#1e293b' : '#f1f5f9',
                  color: selectedDesign.textColor,
                }}
              >
                📸 Pose 3
              </div>

              {/* Brand Footer on Frame */}
              <div
                className="mt-1 pt-2 border-t text-center flex flex-col items-center"
                style={{
                  borderColor: `${selectedDesign.textColor}25`,
                  color: selectedDesign.textColor,
                }}
              >
                <span className="text-[8px] font-black tracking-widest font-mono">
                  PICTOLABS STUDIO
                </span>
                <span className="text-[6px] tracking-wider opacity-70">
                  {selectedDesign.name.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-[11px] text-slate-300 font-semibold">
              Format 3 Pose Photostrip (5x15 cm)
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Dicetak ganda (2 lembar strip identik)
            </p>
          </div>
        </div>

      </div>

      {/* Bottom Action Footer */}
      <div className="px-12 py-5 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 flex justify-between items-center shadow-lg z-20">
        <button
          onClick={() => navigate('welcome')}
          className="px-8 py-3.5 rounded-2xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer text-sm"
        >
          ← BATALKAN SESI
        </button>

        <button
          onClick={handleStartCapture}
          style={{
            backgroundColor: themeColor,
            boxShadow: `0 10px 30px -5px ${themeColor}60`,
          }}
          className="px-12 py-4 rounded-2xl font-display font-black text-white text-base tracking-wider transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-3"
        >
          <span>MULAI SESI FOTO (3 POSE)</span>
          <span className="text-xl leading-none">→</span>
        </button>
      </div>
    </div>
  );
}
