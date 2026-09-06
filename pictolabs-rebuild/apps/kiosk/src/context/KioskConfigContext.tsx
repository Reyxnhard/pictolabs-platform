import React, { createContext, useContext, useState, useEffect } from 'react';
import { kiosk } from '../ipc/bridge';

export interface KioskConfig {
  themeColor: string;
  eventName: string;
  subText: string;
  price: number;
  countdown: number;
  enableVoucher: boolean;
  enableQRIS: boolean;
  activeLayout: string;
  apiBaseUrl?: string;
  cameraPreview?: 'mirror' | 'original'; // Live view viewfinder during countdown ('mirror' default)
  cameraResult?: 'mirror' | 'original';  // Captured photo & live photo video ('mirror' default)
}

export const DEFAULT_KIOSK_CONFIG: KioskConfig = {
  themeColor: '#3b82f6', // Photolab Blue default
  eventName: 'PICTOLABS SELF PHOTOBOOTH',
  subText: 'TOUCH SCREEN TO START',
  price: 35000,
  countdown: 5,
  enableVoucher: true,
  enableQRIS: true,
  activeLayout: '4R',
  cameraPreview: 'mirror',
  cameraResult: 'mirror',
};


interface KioskConfigContextType {
  config: KioskConfig;
  showLiveBanner: boolean;
  bannerText: string;
  updateLocalConfig: (partial: Partial<KioskConfig>) => void;
}

const KioskConfigContext = createContext<KioskConfigContextType>({
  config: DEFAULT_KIOSK_CONFIG,
  showLiveBanner: false,
  bannerText: '',
  updateLocalConfig: () => {},
});

export const KioskConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<KioskConfig>(DEFAULT_KIOSK_CONFIG);
  const [showLiveBanner, setShowLiveBanner] = useState(false);
  const [bannerText, setBannerText] = useState('');

  // Apply theme color CSS variable to root document
  const applyTheme = (color: string) => {
    if (!color) return;
    document.documentElement.style.setProperty('--theme-color', color);
  };

  useEffect(() => {
    // 1. Load initial saved config from kiosk storage
    kiosk.config.get().then((saved) => {
      if (saved && Object.keys(saved).length > 0) {
        console.log('[KioskConfig] Loaded initial config from storage:', saved);
        setConfig((prev) => {
          const merged = { ...prev, ...saved };
          applyTheme(merged.themeColor);
          return merged as KioskConfig;
        });
      } else {
        applyTheme(DEFAULT_KIOSK_CONFIG.themeColor);
      }
    }).catch((err) => {
      console.warn('[KioskConfig] Failed to read initial config:', err);
    });

    // 2. Subscribe to real-time CONFIG_UPDATE broadcast from backend / dashboard
    const unsubscribe = kiosk.config.onConfigUpdated((newConfig) => {
      console.log('⚡ [KioskConfig] Real-time Remote Config received from Cloud:', newConfig);
      
      setConfig((prev) => {
        const merged = { ...prev, ...newConfig };
        applyTheme(merged.themeColor);
        return merged as KioskConfig;
      });

      // Trigger visual feedback banner
      setBannerText(
        newConfig.eventName
          ? `⚡ Config Live Update: ${newConfig.eventName}`
          : '⚡ Tema & Konfigurasi Berhasil Diperbarui dari Cloud!'
      );
      setShowLiveBanner(true);

      const timer = setTimeout(() => {
        setShowLiveBanner(false);
      }, 4000);

      return () => clearTimeout(timer);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const updateLocalConfig = (partial: Partial<KioskConfig>) => {
    setConfig((prev) => {
      const merged = { ...prev, ...partial };
      applyTheme(merged.themeColor);
      return merged;
    });
    kiosk.config.set(partial);
  };

  return (
    <KioskConfigContext.Provider
      value={{
        config,
        showLiveBanner,
        bannerText,
        updateLocalConfig,
      }}
    >
      {children}
    </KioskConfigContext.Provider>
  );
};

export const useKioskConfig = () => useContext(KioskConfigContext);
