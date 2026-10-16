import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AppLogo } from './icons';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

type Listener = (toasts: ToastItem[]) => void;
let toastsList: ToastItem[] = [];
let listeners: Listener[] = [];

function emitChange() {
  for (const listener of listeners) {
    listener([...toastsList]);
  }
}

function addToast(item: ToastItem) {
  toastsList = [...toastsList, item];
  emitChange();

  const duration = item.duration || 3600;
  setTimeout(() => {
    removeToast(item.id);
  }, duration);
}

function removeToast(id: string) {
  toastsList = toastsList.filter((t) => t.id !== id);
  emitChange();
}

export const toast = {
  success: (title: string, description?: string, duration = 3600) => {
    addToast({
      id: Math.random().toString(36).substring(2, 9),
      type: 'success',
      title,
      description,
      duration,
    });
  },
  error: (title: string, description?: string, duration = 4200) => {
    addToast({
      id: Math.random().toString(36).substring(2, 9),
      type: 'error',
      title,
      description,
      duration,
    });
  },
  info: (title: string, description?: string, duration = 3600) => {
    addToast({
      id: Math.random().toString(36).substring(2, 9),
      type: 'info',
      title,
      description,
      duration,
    });
  },
  dismiss: (id: string) => {
    removeToast(id);
  },
};

/**
 * Ultra-Minimalist Frosted Glass Dynamic Island Toaster
 * Originates directly around the top-left brand logo (center at 33px, 30px).
 * Displays the authentic AppLogo in its true form with ZERO checkmarks or icon replacements.
 * The frosted-glass capsule expands horizontally to the right across the top bar.
 */
export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setItems);
    setItems([...toastsList]);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);

  const active = items[0];

  const getStyleForType = (type: ToastItem['type']) => {
    if (type === 'error') {
      return {
        borderColor: 'rgba(244, 63, 94, 0.35)',
        boxShadow:
          '0 14px 36px -4px rgba(0, 0, 0, 0.75), 0 0 20px -2px rgba(244, 63, 94, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
      };
    }
    if (type === 'success') {
      return {
        borderColor: 'rgba(255, 255, 255, 0.35)',
        boxShadow:
          '0 14px 36px -4px rgba(0, 0, 0, 0.75), 0 0 20px -2px rgba(255, 255, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)',
      };
    }
    return {
      borderColor: 'rgba(255, 255, 255, 0.12)',
      boxShadow:
        '0 14px 36px -4px rgba(0, 0, 0, 0.75), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
    };
  };

  const styleConfig = active ? getStyleForType(active.type) : null;

  return (
    <div className="fixed top-[8px] left-[11px] z-[99999] pointer-events-none select-none">
      <AnimatePresence mode="wait">
        {active && styleConfig && (
          <motion.div
            key={active.id}
            initial={{
              width: 44,
              height: 44,
              borderRadius: 22,
              opacity: 0,
              scale: 0.95,
            }}
            animate={{
              width: 320,
              height: 44,
              borderRadius: 22,
              opacity: 1,
              scale: 1,
            }}
            exit={{
              width: 44,
              height: 44,
              borderRadius: 22,
              opacity: 0,
              scale: 0.95,
            }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 24,
              mass: 0.8,
            }}
            style={{
              background: 'rgba(17, 18, 22, 0.82)',
              backdropFilter: 'blur(30px) saturate(190%)',
              WebkitBackdropFilter: 'blur(30px) saturate(190%)',
              borderColor: styleConfig.borderColor,
              boxShadow: styleConfig.boxShadow,
            }}
            className="pointer-events-auto relative overflow-hidden flex items-center justify-between border cursor-default"
          >
            {/* Left: Authentic Brand Application Logo (centered perfectly in 44x44 circle) */}
            <div className="w-[44px] h-[44px] flex items-center justify-center shrink-0">
              <AppLogo className="w-8 h-8 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.85)]" />
            </div>

            {/* Center: Dynamic Message Content expanding from around the icon */}
            <motion.div
              initial={{ opacity: 0, x: -8, filter: 'blur(3px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -6, filter: 'blur(2px)' }}
              transition={{ delay: 0.1, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-w-0 pr-2 pl-0.5 flex flex-col justify-center"
            >
              <h4 className="text-[12px] font-medium text-white/95 tracking-tight truncate leading-tight">
                {active.title}
              </h4>
              {active.description && (
                <p className="text-[10.5px] text-zinc-400 font-normal leading-tight truncate mt-0.5">
                  {active.description}
                </p>
              )}
            </motion.div>

            {/* Right: Minimal dismiss X button */}
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.14 }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                removeToast(active.id);
              }}
              className="w-5 h-5 mr-3 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

