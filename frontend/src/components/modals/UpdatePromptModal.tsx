import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowDown, Check } from '../../icons';
import type { UpdateInfo } from '../../../bindings/changeme/models';

interface UpdatePromptModalProps {
  show: boolean;
  updateInfo: UpdateInfo | null;
  onClose: (dontAskAgain: boolean) => void;
  onUpdateNow: () => void;
}

/**
 * Non-intrusive Update Modal prompting user when a newer release is detected.
 * Designed with pure monochrome dark-mode aesthetic.
 */
export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  show,
  updateInfo,
  onClose,
  onUpdateNow,
}) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!show || !updateInfo) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -6 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="modern-surface rounded-3xl w-full max-w-sm p-5 shadow-2xl border border-white/20 relative overflow-hidden"
        >
          {/* Subtle monochrome ambient glow */}
          <div className="absolute top-0 right-0 w-44 h-44 bg-white/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-xs text-white">Update Available</h3>
                <span className="text-[10px] text-zinc-400">A new version of BYP is ready</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onClose(dontAskAgain)}
              className="text-zinc-400 hover:text-white transition p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Version details card */}
          <div className="my-3.5 p-3 rounded-2xl bg-[#121317] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-500 font-sans uppercase">Current</span>
                <span className="text-zinc-400 font-semibold">v{updateInfo.currentVersion}</span>
              </div>
              <div className="flex items-center text-zinc-600 px-2">
                <span>→</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-zinc-400 font-sans uppercase">Latest</span>
                <span className="text-white font-bold bg-white/15 px-2 py-0.5 rounded-lg border border-white/20">
                  {updateInfo.version.startsWith('v') ? updateInfo.version : `v${updateInfo.version}`}
                </span>
              </div>
            </div>

            {updateInfo.name && updateInfo.name !== updateInfo.version && (
              <div className="text-[11px] font-medium text-zinc-300 pt-1 border-t border-white/5 truncate">
                {updateInfo.name}
              </div>
            )}

            {updateInfo.notes && (
              <div className="mt-1 p-2 rounded-xl bg-black/40 border border-white/5 max-h-24 overflow-y-auto no-scrollbar text-[10px] text-zinc-300 font-normal leading-relaxed whitespace-pre-wrap select-text">
                {updateInfo.notes}
              </div>
            )}
          </div>

          {/* "Don't ask again" option */}
          <div
            onClick={() => setDontAskAgain(!dontAskAgain)}
            className="flex items-center space-x-2 py-1 px-1 cursor-pointer select-none group"
          >
            <div
              className={`w-4 h-4 rounded-md border transition flex items-center justify-center ${
                dontAskAgain
                  ? 'bg-white border-white text-black'
                  : 'bg-white/5 border-white/20 group-hover:border-white/40'
              }`}
            >
              {dontAskAgain && <Check className="w-2.5 h-2.5 stroke-[3] text-black" />}
            </div>
            <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200 transition">
              Don't ask again for this version
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-3">
            <button
              type="button"
              onClick={() => onClose(dontAskAgain)}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white text-xs font-medium transition cursor-pointer"
            >
              Later
            </button>
            <button
              type="button"
              onClick={onUpdateNow}
              className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition active:scale-95 shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <ArrowDown className="w-3 h-3 text-black stroke-[2.5]" />
              <span>Update Now</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
