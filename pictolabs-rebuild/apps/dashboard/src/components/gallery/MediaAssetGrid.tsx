import React, { useState } from 'react';
import type { GalleryAssets } from '../../types/asset';
import { MediaZoomModal } from './MediaZoomModal';
import { Eye, Download, Film, Camera, Layers } from 'lucide-react';

interface MediaAssetGridProps {
  assets: GalleryAssets;
  sessionId: string;
}

export const MediaAssetGrid: React.FC<MediaAssetGridProps> = ({ assets, sessionId }) => {
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);

  const { photoStrip, photos, livePhotos } = assets;

  return (
    <div className="space-y-8">
      {/* 1. PHOTO STRIP COMPOSITE */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Photostrip Composite (Print Layout)
          </h3>
        </div>

        {photoStrip ? (
          <div className="flex flex-col sm:flex-row items-start gap-6 p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div
              className="relative group rounded-xl overflow-hidden border border-slate-700/60 bg-slate-950 shadow-xl cursor-pointer max-w-[200px]"
              onClick={() =>
                setZoomImage({
                  url: photoStrip.url,
                  title: `Photostrip Composite — ${sessionId}`,
                })
              }
            >
              <img
                src={photoStrip.url}
                alt="Composite Photostrip"
                className="w-full h-auto object-contain transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white">
                <Eye className="w-5 h-5" />
                <span className="text-xs font-semibold">Inspect Zoom</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="font-semibold text-slate-200 text-sm">{photoStrip.filename}</p>
                <p className="text-slate-400 font-mono mt-0.5">
                  Size: {photoStrip.sizeFormatted} • 300 DPI Thermal Composite
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setZoomImage({
                      url: photoStrip.url,
                      title: `Photostrip Composite — ${sessionId}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Zoom View
                </button>
                <a
                  href={photoStrip.url}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Composite
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-900/30 border border-slate-800">
            No composite photostrip found for this session.
          </div>
        )}
      </div>

      {/* 2. INDIVIDUAL POSE PHOTOS */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Individual Camera Stills ({photos.length} Poses)
          </h3>
        </div>

        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.filename}
                className="group rounded-2xl overflow-hidden bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/40 transition shadow-lg flex flex-col"
              >
                <div
                  className="relative aspect-[3/2] bg-slate-950 overflow-hidden cursor-pointer"
                  onClick={() =>
                    setZoomImage({
                      url: photo.url,
                      title: `Pose ${photo.pose} — ${sessionId}`,
                    })
                  }
                >
                  <img
                    src={photo.previewUrl || photo.url}
                    alt={`Pose ${photo.pose}`}
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-bold font-mono text-white">
                    POSE {photo.pose}
                  </span>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Eye className="w-5 h-5" />
                  </div>
                </div>

                <div className="p-3 flex items-center justify-between text-xs mt-auto">
                  <span className="text-[11px] text-slate-400 font-mono">{photo.sizeFormatted}</span>
                  <a
                    href={photo.url}
                    download
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition"
                    title={`Download Pose ${photo.pose}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-900/30 border border-slate-800">
            No individual photos captured for this session.
          </div>
        )}
      </div>

      {/* 3. LIVE PHOTO VIDEOS */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Live Photo Video Bursts ({livePhotos.length} Videos)
          </h3>
        </div>

        {livePhotos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {livePhotos.map((vid) => (
              <div
                key={vid.filename}
                className="rounded-2xl overflow-hidden bg-slate-900/60 border border-slate-800/80 p-3 space-y-2.5 shadow-lg flex flex-col"
              >
                <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[3/4]">
                  <video
                    src={vid.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-bold font-mono text-white pointer-events-none">
                    LIVE POSE {vid.pose}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-[11px] text-slate-400 font-mono">{vid.sizeFormatted}</span>
                  <a
                    href={vid.url}
                    download
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition text-xs font-semibold"
                    title={`Download Live Video Pose ${vid.pose}`}
                  >
                    <Download className="w-3 h-3" />
                    MP4
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-900/30 border border-slate-800">
            No live motion videos for this session.
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {zoomImage && (
        <MediaZoomModal
          isOpen={true}
          onClose={() => setZoomImage(null)}
          imageUrl={zoomImage.url}
          title={zoomImage.title}
        />
      )}
    </div>
  );
};
