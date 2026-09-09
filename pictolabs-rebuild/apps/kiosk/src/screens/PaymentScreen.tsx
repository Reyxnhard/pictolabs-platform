import { useState, useEffect, useCallback, useRef } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';
import { kiosk, PrinterHealth } from '../ipc/bridge';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Wrench,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  QrCode as QrIcon,
} from 'lucide-react';

type PaymentState =
  | 'INITIAL'
  | 'GENERATING_QR'
  | 'AWAITING_PAYMENT'
  | 'SETTLED'
  | 'EXPIRED'
  | 'ERROR';

export default function PaymentScreen({ navigate, session, onOpenAdmin }: ScreenProps) {
  const { config } = useKioskConfig();
  const themeColor = config.themeColor || '#3b82f6';
  const price = config.price || 35000;
  const priceFormatted = price.toLocaleString('id-ID');

  const [paymentState, setPaymentState] = useState<PaymentState>('INITIAL');
  const [orderId, setOrderId] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(270);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Printer Health
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null);
  const [isCheckingPrinter, setIsCheckingPrinter] = useState<boolean>(false);
  const [printerBlockedError, setPrinterBlockedError] = useState<string | null>(null);

  const isBypass =
    typeof window !== 'undefined' && localStorage.getItem('pictolabs-bypass-printer') !== 'false';

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 1. Check Hardware Printer Health on Mount ──────────────
  useEffect(() => {
    kiosk.printer
      .getHealth()
      .then((h) => {
        setPrinterHealth(h);
        if (!h.ready && !isBypass) {
          setPrinterBlockedError(h.message || 'Printer sedang offline atau kehabisan kertas/tinta.');
        }
      })
      .catch((err) => {
        console.warn('[PaymentScreen] Printer initial check failed:', err);
      });
  }, [isBypass]);

  // ─── 2. Request Dynamic QRIS ────────────────────────────────
  const requestQRIS = useCallback(async () => {
    // Block if printer is not ready
    try {
      setIsCheckingPrinter(true);
      const health = await kiosk.printer.getHealth();
      setPrinterHealth(health);
      if (!health.ready && !isBypass) {
        setPrinterBlockedError(
          `Transaksi dicegah: ${health.message || 'Printer sedang offline atau kehabisan kertas/tinta'}`
        );
        setIsCheckingPrinter(false);
        return;
      }
    } catch (e) {
      console.warn('[PaymentScreen] Printer pre-check warning:', e);
    } finally {
      setIsCheckingPrinter(false);
    }

    setPaymentState('GENERATING_QR');
    setErrorMessage(null);

    try {
      const res = await kiosk.payment.createQRIS({
        amount: price,
        productName: session.productName || session.frameName || 'Photostrip 2R',
      });

      if (!res.success || !res.qrisString) {
        throw new Error(res.error || 'Gagal menghasilkan barcode QRIS');
      }

      setOrderId(res.orderId);
      localStorage.setItem('pictolabs-active-order-id', res.orderId);

      // Render sharp QR Code canvas / dataURL
      const url = await QRCode.toDataURL(res.qrisString, {
        width: 380,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      setQrDataUrl(url);
      setTimeLeft(270);
      setPaymentState('AWAITING_PAYMENT');
    } catch (err: any) {
      console.error('[PaymentScreen] Error creating QRIS:', err);
      setErrorMessage(err.message || 'Gagal menghubungi gerbang pembayaran');
      setPaymentState('ERROR');
    }
  }, [price, session.productName, session.frameName, isBypass]);

  // ─── 3. Crash Recovery & Auto-initiate on Mount ────────────
  useEffect(() => {
    const savedOrderId = localStorage.getItem('pictolabs-active-order-id');
    if (savedOrderId) {
      // Check status of previous order
      kiosk.payment
        .checkStatus(savedOrderId)
        .then((res) => {
          if (res.paid) {
            console.log('[PaymentScreen] Found settled previous order:', savedOrderId);
            localStorage.removeItem('pictolabs-active-order-id');
            setPaymentState('SETTLED');
            setTimeout(() => navigate('frame-design'), 1500);
          } else {
            // Expired or abandoned, clear and generate fresh
            localStorage.removeItem('pictolabs-active-order-id');
            requestQRIS();
          }
        })
        .catch(() => {
          localStorage.removeItem('pictolabs-active-order-id');
          requestQRIS();
        });
    } else {
      requestQRIS();
    }
  }, [requestQRIS, navigate]);

  // ─── 4. Real-Time WebSocket Listener ────────────────────────
  useEffect(() => {
    const unsubscribeSettled = kiosk.payment.onPaymentSettled((data) => {
      console.log('[PaymentScreen] WebSocket onPaymentSettled received:', data);
      if (!orderId || data.orderId === orderId) {
        localStorage.removeItem('pictolabs-active-order-id');
        setPaymentState('SETTLED');
        setTimeout(() => navigate('frame-design'), 1500);
      }
    });

    const unsubscribeExpired = kiosk.payment.onPaymentExpired((data) => {
      console.log('[PaymentScreen] WebSocket onPaymentExpired received:', data);
      if (data.orderId === orderId) {
        localStorage.removeItem('pictolabs-active-order-id');
        setPaymentState('EXPIRED');
      }
    });

    return () => {
      unsubscribeSettled();
      unsubscribeExpired();
    };
  }, [orderId, navigate]);

  // ─── 5. Fallback Polling (Every 3 seconds) ──────────────────
  useEffect(() => {
    if (paymentState !== 'AWAITING_PAYMENT' || !orderId) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await kiosk.payment.checkStatus(orderId);
        if (res.paid) {
          console.log('[PaymentScreen] Poller detected payment settled:', orderId);
          if (pollingRef.current) clearInterval(pollingRef.current);
          localStorage.removeItem('pictolabs-active-order-id');
          setPaymentState('SETTLED');
          setTimeout(() => navigate('frame-design'), 1500);
        } else if (res.status === 'EXPIRED') {
          setPaymentState('EXPIRED');
        }
      } catch (err) {
        // Suppress network errors during polling
      }
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [paymentState, orderId, navigate]);

  // ─── 6. Countdown Timer (270s) ──────────────────────────────
  useEffect(() => {
    if (paymentState !== 'AWAITING_PAYMENT') return;

    if (timeLeft <= 0) {
      setPaymentState('EXPIRED');
      if (orderId) {
        kiosk.payment.cancel(orderId).catch(console.warn);
      }
      localStorage.removeItem('pictolabs-active-order-id');
      return;
    }

    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, paymentState, orderId]);

  const [isBypassing, setIsBypassing] = useState(false);

  // ─── 7. Bypass Payment (Dev / Testing / Operator) ───────────
  const handleBypassPayment = useCallback(async () => {
    if (!orderId) return;
    setIsBypassing(true);
    try {
      const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/payments/simulate/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        localStorage.removeItem('pictolabs-active-order-id');
        setPaymentState('SETTLED');
        setTimeout(() => navigate('frame-design'), 1500);
      } else {
        // Fallback simulation
        localStorage.removeItem('pictolabs-active-order-id');
        setPaymentState('SETTLED');
        setTimeout(() => navigate('frame-design'), 1500);
      }
    } catch (e) {
      console.warn('[PaymentScreen] Bypass simulation fallback:', e);
      localStorage.removeItem('pictolabs-active-order-id');
      setPaymentState('SETTLED');
      setTimeout(() => navigate('frame-design'), 1500);
    } finally {
      setIsBypassing(false);
    }
  }, [orderId, navigate]);

  // ─── 8. Auto-Bypass Listener (If enabled in Admin Panel) ────
  useEffect(() => {
    if (paymentState === 'AWAITING_PAYMENT' && orderId) {
      const isAutoBypass =
        typeof window !== 'undefined' && localStorage.getItem('pictolabs-auto-bypass-payment') === 'true';
      if (isAutoBypass) {
        console.log('[PaymentScreen] Auto-Bypass active. Simulating payment settlement in 1.2s...');
        const timer = setTimeout(() => {
          handleBypassPayment();
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [paymentState, orderId, handleBypassPayment]);

  // ─── 9. Cancel Payment ──────────────────────────────────────
  const handleCancel = async () => {
    if (orderId) {
      try {
        await kiosk.payment.cancel(orderId);
      } catch (e) {
        console.warn('[PaymentScreen] Cancel request failed:', e);
      }
    }
    localStorage.removeItem('pictolabs-active-order-id');
    navigate('welcome');
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center relative select-none overflow-hidden"
      style={{
        background: `radial-gradient(circle at 50% 10%, #ffffff 0%, ${themeColor}15 45%, ${themeColor}30 100%)`,
      }}
    >
      {/* Hardware Blocker Modal */}
      {printerBlockedError && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-rose-500 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-2xl text-slate-800 mb-2">PRINTER TIDAK SIAP</h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              {printerBlockedError}
              <br />
              <span className="text-xs text-slate-400 mt-2 block">
                Pembayaran dicegah agar pelanggan tidak bertransaksi saat kertas atau tinta habis.
              </span>
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => navigate('welcome')}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
              >
                Kembali
              </button>
              {onOpenAdmin && (
                <button
                  onClick={onOpenAdmin}
                  className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center gap-1.5 transition-colors shadow-lg shadow-rose-600/30"
                >
                  <Wrench className="w-4 h-4" />
                  Menu Staf
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="absolute top-8 left-8 right-8 flex items-center justify-between pointer-events-auto">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/80 hover:bg-white text-slate-700 font-bold text-sm shadow-md backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali / Batal</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Admin Bypass Button */}
          {paymentState === 'AWAITING_PAYMENT' && (
            <button
              onClick={handleBypassPayment}
              disabled={isBypassing}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-amber-300/40"
              title="Bypass pembayaran ini langsung (Simulasi Dev/Operator)"
            >
              <span>⚡</span>
              <span>{isBypassing ? 'Memproses...' : 'Bypass Bayar'}</span>
            </button>
          )}

          {/* Operator Admin Screen Button */}
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-slate-200 hover:text-white font-bold text-xs shadow-md backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-slate-700/60"
              title="Buka Operator Control Panel (PIN: 1234)"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Menu Staf</span>
            </button>
          )}

          {paymentState === 'AWAITING_PAYMENT' && (
            <div className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/90 text-slate-800 font-extrabold text-sm shadow-md border border-slate-200 backdrop-blur-md">
              <span className="animate-pulse text-amber-500">⏱</span>
              <span>
                Sisa Waktu: {mins}:{secs.toString().padStart(2, '0')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-xl px-6 flex flex-col items-center">
        {/* State: SETTLED */}
        {paymentState === 'SETTLED' && (
          <div className="bg-white/95 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border-4 border-emerald-400 text-center flex flex-col items-center w-full animate-slide-up">
            <div className="w-24 h-24 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 shadow-inner">
              <CheckCircle2 className="w-14 h-14" />
            </div>
            <h2 className="font-display text-4xl font-black text-slate-800 mb-2">
              PEMBAYARAN SUKSES!
            </h2>
            <p className="text-slate-500 font-medium text-base mb-4">
              Terima kasih, pembayaran telah terverifikasi otomatis.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Membuka katalog frame foto...
            </div>
          </div>
        )}

        {/* State: GENERATING_QR */}
        {paymentState === 'GENERATING_QR' && (
          <div className="bg-white/90 backdrop-blur-xl p-12 rounded-3xl shadow-2xl border border-slate-200 text-center flex flex-col items-center w-full animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
            </div>
            <h3 className="font-display font-black text-2xl text-slate-800 mb-2">
              Membuat QRIS Dinamis...
            </h3>
            <p className="text-slate-500 text-sm">
              Menghubungkan ke server Midtrans untuk pembuatan kode QR...
            </p>
          </div>
        )}

        {/* State: AWAITING_PAYMENT */}
        {paymentState === 'AWAITING_PAYMENT' && (
          <div className="bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center w-full animate-slide-up">
            {/* Merchant Brand Header */}
            <div className="flex items-center justify-between w-full border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white"
                  style={{ backgroundColor: themeColor }}
                >
                  <QrIcon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-black text-lg text-slate-900 leading-tight">
                    PICTOLABS
                  </h4>
                  <p className="text-slate-400 text-xs font-semibold">National QRIS Payment</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-400 block">TOTAL TAGIHAN</span>
                <span
                  className="font-display font-black text-2xl"
                  style={{ color: themeColor }}
                >
                  Rp {priceFormatted}
                </span>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="p-3 bg-white rounded-2xl shadow-inner border border-slate-200 mb-4 relative group">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QRIS Payment Code"
                  className="w-72 h-72 object-contain rounded-xl"
                />
              ) : (
                <div className="w-72 h-72 flex items-center justify-center bg-slate-50">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              )}
            </div>

            {/* Supported Wallets / Banks Footer */}
            <div className="w-full text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-500 text-xs font-bold mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Mendukung Semua Bank & E-Wallet (BCA, Mandiri, GoPay, OVO, ShopeePay)</span>
              </div>
              <p className="text-slate-400 text-xs">
                Scan kode QR di atas menggunakan aplikasi perbankan atau e-wallet Anda. Layar akan
                berpindah otomatis begitu pembayaran diterima.
              </p>
              {orderId && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                    ID: {orderId}
                  </span>
                  <button
                    onClick={handleBypassPayment}
                    type="button"
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-100/80 hover:bg-amber-100 border border-amber-300/60 px-2.5 py-1 rounded-full cursor-pointer transition-colors flex items-center gap-1"
                    title="Klik untuk menyelesaikan transaksi ini seketika"
                  >
                    <span>⚡ Bypass</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* State: EXPIRED */}
        {paymentState === 'EXPIRED' && (
          <div className="bg-white/95 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border-4 border-amber-400 text-center flex flex-col items-center w-full animate-slide-up">
            <div className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-6">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h3 className="font-display font-black text-3xl text-slate-800 mb-2">
              WAKTU PEMBAYARAN HABIS
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Masa aktif kode QRIS telah berakhir. Anda dapat membuat kode QRIS baru untuk melanjutkan.
            </p>
            <div className="flex gap-4 w-full">
              <button
                onClick={handleCancel}
                className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
              >
                Kembali ke Awal
              </button>
              <button
                onClick={requestQRIS}
                className="flex-1 py-3.5 px-4 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                style={{ backgroundColor: themeColor }}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Buat QR Baru</span>
              </button>
            </div>
          </div>
        )}

        {/* State: ERROR */}
        {paymentState === 'ERROR' && (
          <div className="bg-white/95 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border-4 border-rose-400 text-center flex flex-col items-center w-full animate-slide-up">
            <div className="w-20 h-20 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-6">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h3 className="font-display font-black text-2xl text-slate-800 mb-2">
              GAGAL MEMBUAT PEMBAYARAN
            </h3>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              {errorMessage || 'Terjadi kesalahan komunikasi dengan server pembayaran.'}
            </p>
            <div className="flex gap-4 w-full">
              <button
                onClick={handleCancel}
                className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={requestQRIS}
                className="flex-1 py-3.5 px-4 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                style={{ backgroundColor: themeColor }}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Coba Lagi</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
