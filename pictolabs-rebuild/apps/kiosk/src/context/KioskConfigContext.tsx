import React, { createContext, useContext, useState, useEffect } from 'react';
import { kiosk } from '../ipc/bridge';

export interface KioskConfig {
  configVersion?: number;
  updatedAt?: string;
  boothId?: string;

  pricing?: {
    basePrice: number;
    currency?: string;
    enableVoucher?: boolean;
    enableQRIS?: boolean;
  };

  timing?: {
    paymentTimeoutSec: number;
    poseCountdownSec: number;
    qrTimeoutSec: number;
    idleResetSec?: number;
  };

  hardware?: {
    cameraProfileId?: string | null;
    printerProfileId?: string | null;
    mirrorViewfinder?: boolean;
    paperSize?: string;
  };

  frames?: {
    allowedFrameIds?: string[];
  };

  system?: {
    themeColor: string;
    eventName: string;
    subText: string;
  };

  // Flat fields for backward compatibility with existing screen components
  themeColor: string;
  eventName: string;
  subText: string;
  price: number;
  countdown: number;
  timeout?: number;
  enableVoucher: boolean;
  enableQRIS: boolean;
  activeLayout: string;
  apiBaseUrl?: string;
  cameraPreview?: 'mirror' | 'original'; // Live view viewfinder during countdown ('mirror' default)
  cameraResult?: 'mirror' | 'original';  // Captured photo & live photo video ('mirror' default)
}

export const DEFAULT_KIOSK_CONFIG: KioskConfig = {
  configVersion: 1,
  pricing: {
    basePrice: 35000,
    currency: 'IDR',
    enableVoucher: true,
    enableQRIS: true,
  },
  timing: {
    paymentTimeoutSec: 270,
    poseCountdownSec: 5,
    qrTimeoutSec: 60,
    idleResetSec: 120,
  },
  hardware: {
    cameraProfileId: null,
    printerProfileId: null,
    mirrorViewfinder: true,
    paperSize: '4R',
  },
  frames: {
    allowedFrameIds: [],
  },
  system: {
    themeColor: '#3b82f6',
    eventName: 'PICTOLABS SELF PHOTOBOOTH',
    subText: 'TOUCH SCREEN TO START',
  },
  themeColor: '#3b82f6', // Photolab Blue default
  eventName: 'PICTOLABS SELF PHOTOBOOTH',
  subText: 'TOUCH SCREEN TO START',
  price: 35000,
  countdown: 5,
  timeout: 270,
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

/**
 * Normalizes configuration payload ensuring pricing.basePrice and price stay strictly synchronized.
 * Prevents default hydration values (Rp 35.000) from overriding valid partial price caches (e.g. { price: 1000 }).
 */
export const normalizeConfigPayload = (incoming: any, base: KioskConfig): KioskConfig => {
  if (!incoming || typeof incoming !== 'object') {
    return base;
  }

  const merged: KioskConfig = { ...base, ...incoming };

  const hasIncomingBasePrice =
    typeof incoming?.pricing?.basePrice === 'number' &&
    !isNaN(incoming.pricing.basePrice) &&
    incoming.pricing.basePrice > 0;
  const hasIncomingPrice =
    typeof incoming?.price === 'number' &&
    !isNaN(incoming.price) &&
    incoming.price > 0;

  if (hasIncomingBasePrice) {
    merged.pricing = {
      ...(merged.pricing || DEFAULT_KIOSK_CONFIG.pricing),
      ...(incoming.pricing || {}),
      basePrice: incoming.pricing.basePrice,
    };
    merged.price = incoming.pricing.basePrice;
  } else if (hasIncomingPrice) {
    merged.pricing = {
      ...(merged.pricing || DEFAULT_KIOSK_CONFIG.pricing),
      basePrice: incoming.price,
    };
    merged.price = incoming.price;
  } else if (merged.pricing?.basePrice) {
    merged.price = merged.pricing.basePrice;
  }

  if (merged.timing?.poseCountdownSec) merged.countdown = merged.timing.poseCountdownSec;
  if (merged.timing?.paymentTimeoutSec) merged.timeout = merged.timing.paymentTimeoutSec;
  if (merged.system?.themeColor) merged.themeColor = merged.system.themeColor;
  if (merged.system?.eventName) merged.eventName = merged.system.eventName;
  if (merged.system?.subText) merged.subText = merged.system.subText;

  return merged;
};

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
    // 1. Load initial saved config from local kiosk storage (instant hydration, zero freeze)
    kiosk.config.get().then((saved: any) => {
      if (saved && Object.keys(saved).length > 0) {
        console.log('[KioskConfig] Loaded initial config from storage:', saved);
        setConfig((prev) => {
          const normalized = normalizeConfigPayload(saved, prev);
          applyTheme(normalized.themeColor);
          return normalized;
        });
      } else {
        applyTheme(DEFAULT_KIOSK_CONFIG.themeColor);
      }

      // 2. Trigger asynchronous background remote config reconciliation
      if (typeof kiosk.config.reconcile === 'function') {
        kiosk.config.reconcile().then((reconciled: any) => {
          if (reconciled && Object.keys(reconciled).length > 0) {
            console.log('[KioskConfig] Applied reconciled remote config on boot:', reconciled);
            setConfig((prev) => {
              const normalized = normalizeConfigPayload(reconciled, prev);
              applyTheme(normalized.themeColor);
              return normalized;
            });
          }
        }).catch((err: any) => {
          console.warn('[KioskConfig] Boot reconciliation deferred/offline:', err);
        });
      }
    }).catch((err) => {
      console.warn('[KioskConfig] Failed to read initial config:', err);
    });

    // 3. Subscribe to real-time CONFIG_UPDATE broadcast from backend / dashboard
    const unsubscribe = kiosk.config.onConfigUpdated((newConfig: any) => {
      console.log('⚡ [KioskConfig] Real-time Remote Config received from Cloud:', newConfig);
      
      setConfig((prev) => {
        const normalized = normalizeConfigPayload(newConfig, prev);
        applyTheme(normalized.themeColor);
        return normalized;
      });

      // Trigger visual feedback banner
      const bannerName = newConfig.system?.eventName || newConfig.eventName;
      setBannerText(
        bannerName
          ? `⚡ Config Live Update: ${bannerName}`
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
      const normalized = normalizeConfigPayload(partial, prev);
      applyTheme(normalized.themeColor);
      return normalized;
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
