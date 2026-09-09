import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { galleryApi } from '../services/galleryApi';
import type { GalleryDataResponse } from '../types/asset';
import { MediaAssetGrid } from '../components/gallery/MediaAssetGrid';
import { EmailDeliveryStub } from '../components/gallery/EmailDeliveryStub';
import { CopyButton } from '../components/common/CopyButton';
import { Search, Download, ExternalLink, Calendar, MapPin, AlertCircle, ShieldCheck } from 'lucide-react';

export const GalleryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId') || '';

  const [inputSessionId, setInputSessionId] = useState(initialSessionId);
  const [galleryData, setGalleryData] = useState<GalleryDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGallery = async (sid: string) => {
    if (!sid.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await galleryApi.getGalleryData(sid.trim());
      setGalleryData(data);
    } catch (err: any) {
      console.error('Failed to load gallery assets:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load session gallery');
      setGalleryData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialSessionId) {
      setInputSessionId(initialSessionId);
      fetchGallery(initialSessionId);
    }
  }, [initialSessionId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSessionId.trim()) return;
    setSearchParams({ sessionId: inputSessionId.trim() });
    fetchGallery(inputSessionId.trim());
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight font-['Outfit',sans-serif]">
            Gallery & Softfile Delivery
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Customer support inspector: preview digital softfiles, copy public download links, or trigger email delivery stubs.
          </p>
        </div>

        {/* Search Session Bar */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-96">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={inputSessionId}
              onChange={(e) => setInputSessionId(e.target.value)}
              placeholder="Enter Session ID..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition disabled:opacity-50"
          >
            Load
          </button>
        </form>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="p-16 text-center text-slate-400 space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium">Scanning Cloudflare R2 media bucket...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 space-y-1 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Session Not Found or Inaccessible</p>
            <p className="text-xs text-rose-400/80">{error}</p>
          </div>
        </div>
      )}

      {/* Gallery Content */}
      {galleryData && !isLoading && (
        <div className="space-y-8">
          {/* Session Banner */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white font-mono tracking-wide">
                    {galleryData.sessionId}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wide bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    30-Day Retention Active
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  {galleryData.booth && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                      {galleryData.booth.name} ({galleryData.booth.branchName || 'Grand Indonesia'})
                    </span>
                  )}
                  {galleryData.createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {new Date(galleryData.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <a
                  href={galleryData.customerDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700/60 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Public Web
                </a>

                <CopyButton
                  text={galleryData.customerDownloadUrl}
                  label="Copy Customer Link"
                  className="py-2 px-3.5 font-semibold text-xs"
                />

                <a
                  href={galleryApi.getZipDownloadUrl(galleryData.sessionId)}
                  download
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download ZIP
                </a>
              </div>
            </div>
          </div>

          {/* Media Asset Grid: Photo Strip, Photos, Live Photos */}
          <MediaAssetGrid
            assets={galleryData.assets}
            sessionId={galleryData.sessionId}
          />

          {/* Email Delivery UI Stub */}
          <EmailDeliveryStub sessionId={galleryData.sessionId} />
        </div>
      )}

      {/* Empty Initial Search State */}
      {!galleryData && !isLoading && !error && (
        <div className="p-16 text-center text-slate-400 space-y-3 rounded-2xl bg-slate-900/40 border border-slate-800">
          <p className="text-base font-semibold text-slate-200">
            Enter a Session ID to Inspect Digital Assets
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            View high-resolution composite photo strips, individual DSLR pose shots, live photo motion videos, or copy customer download links.
          </p>
        </div>
      )}
    </div>
  );
};
