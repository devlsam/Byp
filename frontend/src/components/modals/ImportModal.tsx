import React from 'react';
import { Clipboard } from '@wailsio/runtime';
import { X, Edit } from '../../icons';

interface ImportModalProps {
  show: boolean;
  onClose: () => void;
  importText: string;
  setImportText: (val: string) => void;
  importError: string;
  importLoading: boolean;
  onImportManual: () => void;
  onOpenCreateCustom: () => void;
}

/**
 * Modal to import configurations from manual text, share links, or clipboard.
 */
export const ImportModal: React.FC<ImportModalProps> = ({
  show,
  onClose,
  importText,
  setImportText,
  importError,
  importLoading,
  onImportManual,
  onOpenCreateCustom,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="modern-surface rounded-3xl w-full max-w-md p-5 shadow-2xl border border-white/20">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <span className="font-semibold text-xs text-white block">Add Configuration</span>
            <span className="text-[10px] text-zinc-400">Import share link, subscription, or raw JSON</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3.5 space-y-3">
          <textarea
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste vless://, vmess://, trojan://, ss://&#10;or raw Outbound JSON..."
            className="w-full p-3 bg-[#121317] border border-white/10 rounded-2xl text-xs font-mono font-normal text-white focus:outline-none focus:border-white/40 select-text"
          />
          {importError && <div className="text-[10px] font-medium text-rose-400">{importError}</div>}

          {/* Quick option to switch to Custom Builder */}
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <span className="text-[11px] text-zinc-300">Want to build a custom node manually?</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCreateCustom();
              }}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-semibold transition flex items-center space-x-1"
            >
              <Edit className="w-3.5 h-3.5 text-zinc-300" />
              <span>Custom Builder</span>
            </button>
          </div>

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={async () => {
                try {
                  let t = '';
                  try {
                    t = await Clipboard.Text();
                  } catch (_) {
                    t = await navigator.clipboard.readText();
                  }
                  if (t) setImportText(t);
                } catch (_) {}
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 text-[11px] font-medium border border-white/10 transition flex items-center space-x-1"
            >
              <span>Paste Clipboard</span>
            </button>
            <div className="flex space-x-2">
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition"
              >
                Cancel
              </button>
              <button
                onClick={onImportManual}
                disabled={importLoading || !importText.trim()}
                className="px-4 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-slate-200 transition disabled:opacity-40"
              >
                {importLoading ? '...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
