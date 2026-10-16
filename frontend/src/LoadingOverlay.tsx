import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lottie } from 'lottie-react';
import terminalLottie from './assets/terminal_lottie_white.json';
import { TextAnimate } from './TextAnimate';

export type LoadingVariant = 'terminal' | 'radar' | 'sync' | 'connect' | 'update';

export interface LoadingOptions {
  title?: string;
  message?: string;
  successTitle?: string;
  successHighlight?: string;
  successMessage?: string;
  successAfterMs?: number;
  variant?: LoadingVariant;
  timeout?: number;
  progress?: number;
}

type LoadingListener = (state: { isVisible: boolean; options: LoadingOptions }) => void;

class LoadingManager {
  private listeners: Set<LoadingListener> = new Set();
  private timer: any = null;
  private state = {
    isVisible: false,
    options: {
      title: 'Importing Configurations',
      message: 'Parsing protocols and building proxy nodes...',
      successTitle: 'Config Import',
      successHighlight: 'Successful',
      successMessage: 'All proxy configurations validated and ready.',
      successAfterMs: 3000,
      variant: 'terminal' as LoadingVariant,
      progress: undefined as number | undefined,
    },
  };

  subscribe(listener: LoadingListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  show(titleOrOptions?: string | LoadingOptions, message?: string, variant: LoadingVariant = 'terminal') {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    let opts: LoadingOptions = {};
    if (typeof titleOrOptions === 'string') {
      opts = {
        title: titleOrOptions,
        message: message || '',
        variant: variant || 'terminal',
      };
    } else if (titleOrOptions) {
      opts = titleOrOptions;
    }

    this.state = {
      isVisible: true,
      options: {
        title: opts.title || 'Processing...',
        message: opts.message || '',
        successTitle: opts.successTitle || 'Operation',
        successHighlight: opts.successHighlight || 'Successful',
        successMessage: opts.successMessage || '',
        successAfterMs: opts.successAfterMs ?? 3000,
        variant: opts.variant || 'terminal',
        progress: opts.progress,
      },
    };

    const maxTimeout = opts.timeout ?? (opts.variant === 'update' ? 0 : 15000);
    if (maxTimeout > 0) {
      this.timer = setTimeout(() => {
        this.hide();
      }, maxTimeout);
    }

    this.notify();
  }

  hide() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.state.isVisible) {
      this.state.isVisible = false;
      this.notify();
    }
  }

  update(options: Partial<LoadingOptions>) {
    if (this.state.isVisible) {
      this.state.options = { ...this.state.options, ...options };
      this.notify();
    }
  }
}

export const loading = new LoadingManager();

export function LoadingOverlay() {
  const [loadingState, setLoadingState] = useState<{ isVisible: boolean; options: LoadingOptions }>({
    isVisible: false,
    options: {},
  });
  const [isSuccessPhase, setIsSuccessPhase] = useState(false);

  // Periodic 1.5s text animation state for update downloads
  const [updatePhase, setUpdatePhase] = useState<'completed' | 'remaining'>('completed');
  const [updateTick, setUpdateTick] = useState(0);
  const [snapshotProgress, setSnapshotProgress] = useState({ completed: 0, remaining: 100 });
  const progressRef = useRef<number>(0);

  useEffect(() => {
    return loading.subscribe((s) => {
      setLoadingState({ ...s });
    });
  }, []);

  const { isVisible, options } = loadingState;

  useEffect(() => {
    progressRef.current = options.progress ?? 0;
  }, [options.progress]);

  // Handle success phase transition
  useEffect(() => {
    if (!isVisible) {
      setIsSuccessPhase(false);
      return;
    }

    if (options.variant === 'update') {
      // In update mode, success phase only triggers when explicitly complete (progress 100 or ready)
      if (options.progress !== undefined && options.progress >= 100) {
        setIsSuccessPhase(true);
      } else {
        setIsSuccessPhase(false);
      }
      return;
    }

    // For standard operations (like Add Config or Add Subscription), transition to success after delay
    setIsSuccessPhase(false);
    const delay = options.successAfterMs ?? 3000;
    const timer = setTimeout(() => {
      setIsSuccessPhase(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [isVisible, options.variant, options.successAfterMs, options.progress]);

  // Periodic 1.5s interval to cycle between % completed and % remaining with TextAnimate
  useEffect(() => {
    if (!isVisible || options.variant !== 'update' || isSuccessPhase) {
      setUpdateTick(0);
      setUpdatePhase('completed');
      return;
    }

    // Set initial snapshot immediately
    const initCompleted = Math.min(100, Math.max(0, Math.round(progressRef.current)));
    setSnapshotProgress({
      completed: initCompleted,
      remaining: Math.max(0, 100 - initCompleted),
    });

    const interval = setInterval(() => {
      const curCompleted = Math.min(100, Math.max(0, Math.round(progressRef.current)));
      const curRemaining = Math.max(0, 100 - curCompleted);
      setSnapshotProgress({
        completed: curCompleted,
        remaining: curRemaining,
      });
      setUpdatePhase((prev) => (prev === 'completed' ? 'remaining' : 'completed'));
      setUpdateTick((prev) => prev + 1);
    }, 1500);

    return () => clearInterval(interval);
  }, [isVisible, options.variant, isSuccessPhase]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-2xl p-6 select-none"
        >
          {/* Subtle Ambient Radial Glow in the center */}
          <div className="absolute w-80 h-80 rounded-full bg-white/[0.05] blur-3xl pointer-events-none -z-10" />

          {/* Floating Content: Fullscreen seamless, NO box */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            {/* Signature Terminal Lottie Animation for all overlays */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-3">
              <div className="w-28 h-28 flex items-center justify-center relative">
                <motion.div
                  animate={
                    isSuccessPhase
                      ? { scale: [1, 1.45, 1.25], opacity: [0.3, 0.9, 0.6] }
                      : { scale: [1, 1.15, 1], opacity: [0.2, 0.5, 0.2] }
                  }
                  transition={
                    isSuccessPhase
                      ? { duration: 0.8, ease: 'easeOut' }
                      : { repeat: Infinity, duration: 2.2, ease: 'easeInOut' }
                  }
                  className="absolute inset-0 rounded-full bg-white/15 blur-xl -z-10"
                />
                <Lottie
                  src={terminalLottie}
                  loop
                  autoplay
                  className="w-28 h-28 drop-shadow-[0_0_24px_rgba(255,255,255,0.85)]"
                />
              </div>
            </div>

            {/* Dynamic Typography with Character Slide Animation */}
            <div className="min-h-[58px] flex flex-col items-center justify-center">
              {options.variant === 'update' && !isSuccessPhase ? (
                <div className="flex flex-col items-center text-center">
                  <h3 className="text-[12px] font-semibold text-zinc-400 tracking-tight mb-1 uppercase tracking-wider">
                    {options.title || 'Downloading Update'}
                  </h3>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`update-${updatePhase}-${updateTick}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5, filter: 'blur(4px)' }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center justify-center min-h-[46px]"
                    >
                      <div className="flex items-center justify-center">
                        <TextAnimate
                          key={`txt-${updateTick}`}
                          animation="slideLeft"
                          by="character"
                          duration={0.3}
                          className="text-[22px] font-black text-white tracking-normal drop-shadow-[0_0_18px_rgba(255,255,255,0.95)]"
                        >
                          {updatePhase === 'completed'
                            ? `${snapshotProgress.completed}% Completed`
                            : `${snapshotProgress.remaining}% Remaining`}
                        </TextAnimate>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-normal mt-0.5 leading-relaxed">
                        {updatePhase === 'completed'
                          ? `${snapshotProgress.remaining}% remaining`
                          : `${snapshotProgress.completed}% completed`}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {!isSuccessPhase ? (
                    <motion.div
                      key="initial-loading-block"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8, filter: 'blur(5px)' }}
                      transition={{ duration: 0.22 }}
                      className="flex flex-col items-center text-center"
                    >
                      <h3 className="text-[16px] font-bold text-white tracking-tight leading-snug drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                        {options.title || 'Processing'}
                      </h3>
                      {options.message && (
                        <p className="text-[11px] text-zinc-400 font-normal mt-1 max-w-[280px] leading-relaxed">
                          {options.message}
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="success-loading-block"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col items-center text-center"
                    >
                      {/* Header with slideLeft character-by-character animation */}
                      <div className="flex items-center justify-center flex-wrap gap-x-2">
                        <TextAnimate
                          animation="slideLeft"
                          by="character"
                          className="text-[16px] font-semibold text-zinc-300 tracking-tight"
                        >
                          {options.successTitle || 'Process'}
                        </TextAnimate>
                        <TextAnimate
                          animation="slideLeft"
                          by="character"
                          delay={0.24}
                          className="text-[17px] font-black text-white tracking-normal drop-shadow-[0_0_18px_rgba(255,255,255,1)]"
                        >
                          {options.successHighlight || 'Successful'}
                        </TextAnimate>
                      </div>
                      {options.successMessage && (
                        <p className="text-[11px] text-zinc-400 font-normal mt-1 max-w-[280px] leading-relaxed">
                          {options.successMessage}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
