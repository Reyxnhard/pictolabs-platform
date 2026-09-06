import { useState, useEffect } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';
import { kiosk, PrinterHealth } from '../ipc/bridge';
import { AlertTriangle, Wrench } from 'lucide-react';

export default function PaymentScreen({ navigate, session, onOpenAdmin }: ScreenProps) {
  const [timeLeft, setTimeLeft] = useState(270);
  const [isPaid, setIsPaid] = useState(false);
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null);
  const [isCheckingPrinter, setIsCheckingPrinter] = useState(false);
  const [printerBlockedError, setPrinterBlockedError] = useState<string | null>(null);
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';
  const priceFormatted = (config.price || 35000).toLocaleString('id-ID');

  useEffect(() => {
    if (timeLeft <= 0) {
      navigate('welcome');
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, navigate]);

  // Check if developer has enabled printer bypass
  const isBypass = typeof window !== 'undefined' && localStorage.getItem('pictolabs-bypass-printer') !== 'false';

  // Initial printer health check
  useEffect(() => {
    kiosk.printer.getHealth().then((h) => {
      setPrinterHealth(h);
      if (!h.ready && !isBypass) {
        setPrinterBlockedError(h.message || 'Printer sedang kehabisan kertas.');
      }
    }).catch(console.warn);
  }, [isBypass]);

  const handleSelectPayment = async () => {
    setIsCheckingPrinter(true);
    try {
      const health = await kiosk.printer.getHealth();
      setPrinterHealth(health);
      if (!health.ready && !isBypass) {
        setPrinterBlockedError(
          `Transaksi dibatalkan: ${health.message || 'Printer sedang offline atau kehabisan kertas/tinta'}`
        );
        return;
      }
      setPrinterBlockedError(null);
      setIsPaid(true);
      setTimeout(() => navigate('frame-design'), 1500);
    } catch (err: any) {
      console.error('[PaymentScreen] Printer check failed:', err);
      // Fallback: continue if unable to contact printer service in dev
      setIsPaid(true);
      setTimeout(() => navigate('frame-design'), 1500);
    } finally {
      setIsCheckingPrinter(false);
    }
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center relative transition-colors duration-700 select-none"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}20 50%, ${themeColor} 100%)`,
      }}
    >
      {/* Printer Health Hardware Blocker Modal */}
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
                Pembayaran tidak dapat diproses untuk mencegah transaksi tanpa hasil cetak fisik.
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
                  Buka Menu Staf
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isPaid ? (
        <div className="text-center animate-slide-up bg-white p-12 rounded-3xl shadow-2xl border-4 border-emerald-400 max-w-md">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl font-bold">
            ✓
          </div>
          <h2 className="font-display text-3xl font-extrabold text-slate-800 mb-2">PEMBAYARAN SUKSES!</h2>
          <p className="text-slate-500 font-medium">Membuka katalog desain frame...</p>
        </div>
      ) : (
        <div className="w-full max-w-2xl px-8 animate-slide-up flex flex-col items-center">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-white shadow-sm text-slate-600 font-bold text-sm mb-4">
              ⏱ SISA WAKTU: {mins}:{secs.toString().padStart(2, '0')}
            </div>
            <h2 className="font-display text-4xl font-black text-slate-800 tracking-tight">METODE PEMBAYARAN</h2>
            <p className="text-slate-500 font-medium mt-1">Produk: {session.productName || session.frameName || 'Photostrip 2R'}</p>
          </div>

          {/* Price Header */}
          <div
            className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 w-full text-center mb-8"
            style={{
              boxShadow: `0 20px 40px -15px ${themeColor}35`,
            }}
          >
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">TOTAL HARGA</span>
            <h3
              className="font-display text-5xl font-black mt-1 transition-colors duration-500"
              style={{ color: themeColor }}
            >
              Rp {priceFormatted}
            </h3>
          </div>

          {/* Payment Method Cards */}
          <div className="grid grid-cols-2 gap-6 w-full mb-8">
            {/* QRIS */}
            <button
              onClick={handleSelectPayment}
              disabled={isCheckingPrinter}
              className="bg-white hover:bg-slate-50 border-4 border-transparent hover:border-blue-400 p-8 rounded-3xl shadow-lg transition-all duration-300 text-center group flex flex-col items-center cursor-pointer disabled:opacity-50"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
              >
                📲
              </div>
              <h4 className="font-display font-black text-2xl text-slate-800 mb-1">QRIS</h4>
              <p className="text-slate-400 text-xs font-medium">BCA, Mandiri, GoPay, OVO, ShopeePay</p>
            </button>

            {/* Cash / Voucher */}
            <button
              onClick={handleSelectPayment}
              disabled={isCheckingPrinter}
              className="bg-white hover:bg-slate-50 border-4 border-transparent hover:border-blue-400 p-8 rounded-3xl shadow-lg transition-all duration-300 text-center group flex flex-col items-center cursor-pointer disabled:opacity-50"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform"
                style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
              >
                🎟️
              </div>
              <h4 className="font-display font-black text-2xl text-slate-800 mb-1">VOUCHER</h4>
              <p className="text-slate-400 text-xs font-medium">Masukkan kupon promo atau kartu member</p>
            </button>
          </div>

          {/* Cancel button */}
          <button
            onClick={() => navigate('welcome')}
            className="text-slate-600 hover:text-slate-900 font-bold text-sm tracking-wide uppercase px-6 py-2 rounded-full hover:bg-white/50 transition-colors"
          >
            Batal
          </button>
        </div>
      )}
    </div>
  );
}
