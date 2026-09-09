import React, { useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface MediaZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
}

export const MediaZoomModal: React.FC<MediaZoomModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/90 backdrop-blur-md transition-opacity"
      />

      {/* Modal Container */}
      <div className="relative max-w-4xl max-h-[92vh] flex flex-col items-center z-10">
        {/* Top Controls */}
        <div className="w-full flex items-center justify-between pb-3 text-white">
          <span className="font-semibold text-sm tracking-wide font-['Outfit',sans-serif]">
            {title}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition"
              title="Open full resolution"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={imageUrl}
              download
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
              title="Download original image"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* High-res Image Preview */}
        <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-2xl max-h-[82vh]">
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[82vh] w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
};
