import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw, Clock, Globe, LogOut, User } from 'lucide-react';
import { useSocketStore } from '../../stores/socketStore';
import { useTranslation } from '../../locales/useTranslation';
import { useAuthStore } from '../../stores/useAuthStore';

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isConnected = useSocketStore((state) => state.isConnected);
  const { t, lang, setLang } = useTranslation();
  const { user, logout } = useAuthStore();
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumb = () => {
    switch (location.pathname) {
      case '/':
        return t('nav.overview');
      case '/booths':
        return t('nav.booths');
      case '/sessions':
        return t('nav.sessions');
      case '/gallery':
        return t('nav.gallery');
      case '/support':
        return t('nav.support');
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="h-16 px-8 bg-slate-950/60 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between sticky top-0 z-40">
      {/* Title & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Operations
        </span>
        <span className="text-slate-600">/</span>
        <h1 className="text-sm font-bold text-white tracking-wide font-['Outfit',sans-serif]">
          {getBreadcrumb()}
        </h1>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Clock */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>{timeStr || 'Loading...'}</span>
        </div>

        {/* Real-time indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-300 font-mono text-[11px]">
            {isConnected ? 'Socket Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Language Switcher Bar */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-lg text-xs">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <button
            type="button"
            onClick={() => setLang('id')}
            className={`font-semibold px-1.5 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
              lang === 'id' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            ID
          </button>
          <span className="text-slate-700 text-xs">|</span>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`font-semibold px-1.5 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
              lang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            EN
          </button>
        </div>

        {/* Manual Refresh Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
            title="Refresh current page data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        )}

        {/* User Profile & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold text-slate-200 hidden md:inline truncate max-w-[120px]">
              {user?.name || 'Administrator'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition cursor-pointer"
            title={t('auth.signOut')}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('auth.signOut')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
