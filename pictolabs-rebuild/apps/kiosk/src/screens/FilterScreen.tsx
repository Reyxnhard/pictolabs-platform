import { useState } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';

const FILTERS = [
  { id: 'original', name: 'Original Studio', desc: 'Warna natural & jernih', filterStyle: 'none', icon: '✨' },
  { id: 'bw', name: 'Black & White', desc: 'Kontras tinggi klasik', filterStyle: 'grayscale(100%) contrast(115%)', icon: '🖤' },
  { id: 'sepia', name: 'Warm Retro', desc: 'Nuansa hangat lembut', filterStyle: 'sepia(60%) saturate(130%)', icon: '☕' },
  { id: 'vivid', name: 'Vivid Pop', desc: 'Warna cerah ceria', filterStyle: 'saturate(170%) contrast(110%)', icon: '🌈' },
  { id: 'cool', name: 'Cool Film', desc: 'Nuansa sinematik sejuk', filterStyle: 'hue-rotate(180deg) saturate(110%)', icon: '❄️' },
  { id: 'vintage', name: '90s Nostalgia', desc: 'Karakter kamera film', filterStyle: 'contrast(90%) brightness(110%) saturate(85%)', icon: '📼' },
];

export default function FilterScreen({ navigate, updateSession, session }: ScreenProps) {
  const [selectedFilter, setSelectedFilter] = useState('original');
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';

  const handleContinue = () => {
    updateSession({ filter: selectedFilter });
    navigate('render');
  };

  const samplePhoto = session.photos?.[0] || '';

  return (
    <div 
      className="w-full h-full flex flex-col transition-colors duration-700 select-none relative"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}15 45%, ${themeColor} 100%)`,
      }}
    >
      {/* Header */}
      <div className="px-12 pt-10 pb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span 
              className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow"
              style={{ backgroundColor: themeColor }}
            >
              Step 3 of 4
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {config.eventName}
            </span>
          </div>
          <h2 className="font-display text-4xl font-black text-slate-900 tracking-tight">
            PILIH FILTER & COLOR GRADING
          </h2>
          <p className="text-slate-500 font-medium text-sm">
            Sentuh preset filter di samping untuk melihat pratinjau langsung
          </p>
        </div>

        <div className="px-5 py-2.5 rounded-2xl bg-white/80 backdrop-blur-md shadow-md border border-slate-100 flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">LAYOUT:</span>
          <span 
            className="font-black text-sm"
            style={{ color: themeColor }}
          >
            {session.frameName || '4R Classic 4-Grid'}
          </span>
        </div>
      </div>

      {/* Main Preview & Filter Options */}
      <div className="flex-1 px-12 flex gap-12 items-center justify-center">
        {/* Big Preview Frame */}
        <div 
          className="w-[520px] h-[370px] bg-white/90 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border-4 border-white overflow-hidden flex items-center justify-center transition-all duration-500"
          style={{
            boxShadow: `0 25px 50px -15px ${themeColor}35`
          }}
        >
          {samplePhoto ? (
            <img
              src={samplePhoto}
              alt="Filter preview"
              className="w-full h-full object-cover rounded-2xl transition-all duration-500"
              style={{
                filter: FILTERS.find((f) => f.id === selectedFilter)?.filterStyle || 'none',
              }}
            />
          ) : (
            <div className="text-center">
              <span className="text-4xl mb-2 block">📷</span>
              <span className="text-slate-400 font-bold text-sm">Preview Foto Sesi</span>
            </div>
          )}
        </div>

        {/* Filter Selection Grid */}
        <div className="grid grid-cols-2 gap-3.5 w-[420px]">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`p-4 rounded-2xl text-left transition-all duration-300 bg-white/90 backdrop-blur-md border-4 cursor-pointer ${
                selectedFilter === f.id
                  ? 'scale-105 shadow-xl'
                  : 'border-transparent shadow-sm hover:shadow-md hover:scale-[1.02]'
              }`}
              style={{
                borderColor: selectedFilter === f.id ? themeColor : 'transparent',
                boxShadow: selectedFilter === f.id ? `0 15px 30px -10px ${themeColor}40` : undefined,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{f.icon}</span>
                <span className="font-extrabold text-slate-800 text-sm">{f.name}</span>
              </div>
              <p className="text-slate-400 text-[11px] font-medium">{f.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Footer Navigation Bar */}
      <div className="px-12 py-5 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 flex justify-between items-center shadow-lg">
        <button
          onClick={() => navigate('capture')}
          className="px-8 py-3.5 rounded-2xl font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          ← RETAKE FOTO
        </button>
        <button
          onClick={handleContinue}
          style={{
            backgroundColor: themeColor,
            boxShadow: `0 10px 30px -5px ${themeColor}60`
          }}
          className="px-12 py-4 rounded-2xl font-display font-black text-white text-base tracking-wider transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          CETAK SEKARANG (300 DPI) →
        </button>
      </div>
    </div>
  );
}
