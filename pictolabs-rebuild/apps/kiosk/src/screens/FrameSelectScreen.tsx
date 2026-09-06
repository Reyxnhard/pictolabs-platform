import { useState } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';

const DEMO_FRAMES = [
  { id: '1', name: '2R Strip Cut', category: '2R', preview: '🎞️', slots: 4, desc: 'Dual 2x6 strip photo (Populer)' },
  { id: '2', name: '4R Single Pose', category: '4R', preview: '📸', slots: 1, desc: '4x6 single portrait postcard' },
  { id: '3', name: '4R Dual Pose', category: '4R', preview: '📷', slots: 2, desc: '4x6 split two poses portrait' },
  { id: '4', name: '4R Triple Grid', category: '4R', preview: '🖼️', slots: 3, desc: '4x6 three photo collage' },
  { id: '5', name: '4R Classic 4-Grid', category: '4R', preview: '🎬', slots: 4, desc: '4x6 classic 4-pose Korean style' },
  { id: '6', name: '6R Panoramic Studio', category: '6R', preview: '🌅', slots: 1, desc: '6x8 large photo premium print' },
];

export default function FrameSelectScreen({ navigate, updateSession }: ScreenProps) {
  const [selected, setSelected] = useState<string>('5'); // default to Classic 4-Grid
  const [category, setCategory] = useState<string>('ALL');
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';
  const filtered = category === 'ALL' ? DEMO_FRAMES : DEMO_FRAMES.filter((f) => f.category === category);

  const handleContinue = () => {
    if (!selected) return;
    const frame = DEMO_FRAMES.find((f) => f.id === selected);
    updateSession({ frameId: selected, frameName: frame?.name });
    navigate('payment');
  };

  return (
    <div 
      className="w-full h-full flex flex-col transition-colors duration-700 select-none relative"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}15 45%, ${themeColor} 100%)`,
      }}
    >
      {/* Top Header */}
      <div className="px-12 pt-10 pb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span 
              className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow"
              style={{ backgroundColor: themeColor }}
            >
              Step 1 of 4
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {config.eventName}
            </span>
          </div>
          <h2 className="font-display text-4xl font-black text-slate-900 tracking-tight">
            PILIH FORMAT & FRAME FOTO
          </h2>
          <p className="text-slate-500 font-medium text-sm">
            Tentukan layout cetak favoritmu sebelum memulai sesi foto
          </p>
        </div>

        <div className="px-6 py-2.5 rounded-2xl bg-white/80 backdrop-blur-md shadow-md border border-slate-100 flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400">TARIF SESI</span>
          <span 
            className="font-black font-mono text-xl"
            style={{ color: themeColor }}
          >
            Rp {(config.price || 35000).toLocaleString('id-ID')}
          </span>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="px-12 mb-6 flex gap-3">
        {['ALL', '2R', '4R', '6R'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={category === cat ? { backgroundColor: themeColor } : {}}
            className={`px-8 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all duration-300 cursor-pointer ${
              category === cat
                ? 'text-white shadow-xl scale-105'
                : 'bg-white/90 text-slate-600 hover:bg-white shadow-sm border border-slate-100'
            }`}
          >
            {cat === 'ALL' ? 'SEMUA FORMAT' : `${cat} Series`}
          </button>
        ))}
      </div>

      {/* Frame Grid: Bento Cards */}
      <div className="flex-1 px-12 overflow-y-auto pb-8">
        <div className="grid grid-cols-3 gap-6">
          {filtered.map((frame) => (
            <button
              key={frame.id}
              onClick={() => setSelected(frame.id)}
              className={`rounded-3xl p-7 text-left transition-all duration-300 bg-white/90 backdrop-blur-md border-4 relative overflow-hidden cursor-pointer group ${
                selected === frame.id
                  ? 'scale-[1.03] shadow-2xl'
                  : 'border-transparent shadow-md hover:shadow-xl hover:scale-[1.01]'
              }`}
              style={{
                borderColor: selected === frame.id ? themeColor : 'transparent',
                boxShadow: selected === frame.id ? `0 20px 40px -10px ${themeColor}40` : undefined,
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-sm transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${themeColor}15` }}
                >
                  {frame.preview}
                </div>
                <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
                  {frame.slots} Foto
                </span>
              </div>

              <h3 className="font-display font-black text-slate-800 text-xl mb-1">{frame.name}</h3>
              <p className="text-slate-400 text-xs font-medium">{frame.desc}</p>

              {selected === frame.id && (
                <div 
                  className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md"
                  style={{ backgroundColor: themeColor }}
                >
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Footer Navigation Bar */}
      <div className="px-12 py-5 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 flex justify-between items-center shadow-lg">
        <button
          onClick={() => navigate('welcome')}
          className="px-8 py-3.5 rounded-2xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          ← KEMBALI
        </button>

        <button
          onClick={handleContinue}
          disabled={!selected}
          style={{
            backgroundColor: themeColor,
            boxShadow: `0 10px 30px -5px ${themeColor}60`
          }}
          className="px-12 py-4 rounded-2xl font-display font-black text-white text-base tracking-wider transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
        >
          LANJUT KE PEMBAYARAN →
        </button>
      </div>
    </div>
  );
}
