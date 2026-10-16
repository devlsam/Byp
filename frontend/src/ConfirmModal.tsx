import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, HelpCircle, X } from './icons';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: 'trash' | 'warning' | 'question';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

type ConfirmListener = (state: ConfirmState | null) => void;

class ConfirmManager {
  private listener: ConfirmListener | null = null;

  subscribe(listener: ConfirmListener) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.listener) {
        this.listener({
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          isDestructive: false,
          icon: options.isDestructive ? 'trash' : 'question',
          ...options,
          resolve: (val: boolean) => {
            if (this.listener) this.listener(null);
            resolve(val);
          },
        });
      } else {
        // Fallback for non-browser/unmounted states
        resolve(window.confirm(`${options.title}\n\n${options.message}`));
      }
    });
  }
}

export const confirmDialog = new ConfirmManager();

export const ConfirmModal: React.FC = () => {
  const [dialog, setDialog] = useState<ConfirmState | null>(null);

  useEffect(() => {
    return confirmDialog.subscribe((state) => {
      setDialog(state);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialog) {
      dialog.resolve(true);
    }
  }, [dialog]);

  const handleCancel = useCallback(() => {
    if (dialog) {
      dialog.resolve(false);
    }
  }, [dialog]);

  // Keyboard navigation: Escape to cancel, Enter to confirm
  useEffect(() => {
    if (!dialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog, handleCancel, handleConfirm]);

  return (
    <AnimatePresence>
      {dialog && (
        <motion.div
          key="confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleCancel}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xl select-none"
        >
          <motion.div
            key="confirm-card"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[340px] rounded-3xl p-5 bg-[#14151a]/95 border border-white/[0.14] shadow-[0_25px_65px_-12px_rgba(0,0,0,0.85)] relative overflow-hidden flex flex-col items-center text-center backdrop-blur-2xl"
          >
            {/* Top ambient highlight */}
            <div
              className={`absolute -top-16 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full blur-3xl pointer-events-none ${
                dialog.isDestructive
                  ? 'bg-rose-500/20'
                  : 'bg-white/10'
              }`}
            />

            {/* Close Button top-right */}
            <button
              onClick={handleCancel}
              className="absolute top-3.5 right-3.5 w-7 h-7 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Icon Badge */}
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3.5 border shadow-lg relative ${
                dialog.isDestructive
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-rose-950/40'
                  : 'bg-white/[0.08] border-white/20 text-white shadow-black/40'
              }`}
            >
              {dialog.isDestructive ? (
                dialog.icon === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                ) : (
                  <Trash2 className="w-5 h-5 text-rose-400" />
                )
              ) : (
                <HelpCircle className="w-5 h-5 text-zinc-200" />
              )}
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-white tracking-tight px-2">
              {dialog.title}
            </h3>

            {/* Message */}
            <p className="text-xs text-zinc-400 font-normal leading-relaxed mt-1.5 mb-5 px-1 max-w-[280px]">
              {dialog.message}
            </p>

            {/* Action Buttons */}
            <div className="w-full grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCancel}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-98 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium transition duration-150 flex items-center justify-center"
              >
                {dialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                autoFocus
                className={`w-full py-2 px-3 rounded-xl active:scale-98 text-xs font-semibold transition duration-150 flex items-center justify-center shadow-md ${
                  dialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white border border-rose-400/30 shadow-rose-950/50'
                    : 'bg-white hover:bg-zinc-200 active:bg-zinc-300 text-black shadow-white/10'
                }`}
              >
                {dialog.confirmText || 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
