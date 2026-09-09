import React, { useState } from 'react';
import { Mail, Send, Info, CheckCircle2 } from 'lucide-react';

interface EmailDeliveryStubProps {
  sessionId: string;
}

export const EmailDeliveryStub: React.FC<EmailDeliveryStubProps> = ({ sessionId }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Display user-facing notification acknowledging UI stub
    setToastMessage(
      `Email delivery stub acknowledged for ${email} (Session: ${sessionId}). Email dispatch provider integration is scheduled for future release.`
    );

    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400">
          <Mail className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white tracking-wide font-['Outfit',sans-serif]">
            Customer Email Delivery (UI Action)
          </h4>
          <p className="text-xs text-slate-400">
            Dispatch softfile digital gallery link directly to customer inbox for session {sessionId}.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Customer Email Address <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Customer Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>UI Stub • Integrates with Cloudflare R2 links</span>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 transition"
          >
            <Send className="w-3.5 h-3.5" />
            Kirim Softfile via Email
          </button>
        </div>
      </form>

      {/* Confirmation Toast / Banner */}
      {toastMessage && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p>{toastMessage}</p>
        </div>
      )}
    </div>
  );
};
