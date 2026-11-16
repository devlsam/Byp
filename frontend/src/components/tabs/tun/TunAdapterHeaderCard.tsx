import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Events } from '@wailsio/runtime';
import { AppService } from '../../../../bindings/changeme';
import type { ZeltunStats } from '../../../../bindings/changeme/internal/tun/models';
import { Check, ChevronRight, Cpu, ZeltunIcon } from '../../../icons';
import {
  areTunStatsEqual,
  formatCompactBytes,
  TUN_ENGINE_CORES,
  type TunEngine,
} from './tunConfig';

interface TunAdapterHeaderCardProps {
  activeEngine: TunEngine;
  connected: boolean;
  mode: string;
  currentMtu: number;
  isActive: boolean;
  onSwitchToTun: () => void;
  onSwitchEngine: (engine: TunEngine) => void;
}

/**
 * Slim adapter status strip with floating glass TUN Engine switcher
 * and isolated 1s live Zeltun telemetry HUD.
 */
export const TunAdapterHeaderCard: React.FC<TunAdapterHeaderCardProps> = React.memo(
  ({ activeEngine, connected, mode, currentMtu, isActive, onSwitchToTun, onSwitchEngine }) => {
    const [tunStats, setTunStats] = useState<ZeltunStats | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isTunMode = mode === 'tun' || mode === 'upstream';
    const shouldPollTelemetry = connected && isTunMode && activeEngine === 'zeltun';
    const isTunRunning = connected && isTunMode;
    const activeCore =
      TUN_ENGINE_CORES.find((c) => c.id === activeEngine) || TUN_ENGINE_CORES[0];

    useEffect(() => {
      if (!isActive) setIsMenuOpen(false);
    }, [isActive]);

    useEffect(() => {
      if (!isMenuOpen) return;
      const handlePointerDown = (e: PointerEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsMenuOpen(false);
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsMenuOpen(false);
      };
      window.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [isMenuOpen]);

    useEffect(() => {
      if (!shouldPollTelemetry) {
        setTunStats((prev) => (prev === null ? prev : null));
        return;
      }
      if (!isActive) return;

      let active = true;
      AppService.GetTunStats()
        .then((s) => {
          if (active) setTunStats((prev) => (areTunStatsEqual(prev, s) ? prev : s));
        })
        .catch(() => {});

      const unbind = Events.On('tun:stats', (ev: any) => {
        if (ev?.data && active) {
          const next = ev.data as ZeltunStats;
          setTunStats((prev) => (areTunStatsEqual(prev, next) ? prev : next));
        }
      });

      return () => {
        active = false;
        unbind();
      };
    }, [shouldPollTelemetry, isActive]);

    const showZeltunTelemetry =
      shouldPollTelemetry && tunStats !== null && tunStats.isRunning === 1;
    const totalSplitBytes =
      showZeltunTelemetry && tunStats ? tunStats.proxyBytes + tunStats.directBytes : 0;
    const proxyPct =
      totalSplitBytes > 0 && tunStats
        ? Math.round((tunStats.proxyBytes / totalSplitBytes) * 100)
        : 100;

    return (
      <div ref={containerRef} className="relative z-30 shrink-0">
        <div className="modern-surface rounded-2xl border border-white/10">
          {/* Interactive Adapter & Engine Row */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <button
              type="button"
              aria-expanded={isMenuOpen}
              aria-haspopup="listbox"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-lg"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isTunRunning
                      ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]'
                      : 'bg-zinc-600'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {activeCore.name === 'Zeltun' ? (
                      <ZeltunIcon className="w-3.5 h-3.5 text-white shrink-0" />
                    ) : (
                      <Cpu className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-white truncate">
                      {activeCore.name}
                    </span>
                    <span className="text-[9px] font-mono uppercase text-zinc-400 shrink-0">
                      {activeCore.runtime}
                    </span>
                    {activeCore.recommended && (
                      <span className="text-[8.5px] font-medium px-1.5 py-[1px] rounded bg-white/10 text-zinc-200 border border-white/15 shrink-0">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                    {isTunRunning
                      ? mode === 'upstream'
                        ? `BYP-TUN Active (Upstream) · MTU ${currentMtu}`
                        : `BYP-TUN Active · MTU ${currentMtu}`
                      : !isTunMode
                      ? `${mode.toUpperCase()} Mode · MTU ${currentMtu}`
                      : `BYP-TUN Standby · MTU ${currentMtu}`}
                  </div>
                </div>
              </div>

              <span className="text-[10px] px-2.5 py-1 rounded-xl bg-white/[0.08] border border-white/10 text-zinc-200 group-hover:bg-white/[0.15] group-hover:text-white font-medium flex items-center gap-1 shrink-0 transition-colors duration-150">
                <span>Engine</span>
                <ChevronRight
                  className={`w-2.5 h-2.5 transition-transform duration-150 ${
                    isMenuOpen ? 'rotate-90' : ''
                  }`}
                />
              </span>
            </button>

            {!isTunMode && (
              <button
                type="button"
                onClick={onSwitchToTun}
                className="px-2.5 py-1 rounded-xl bg-white hover:bg-zinc-200 text-black text-[10px] font-semibold will-change-transform transition-transform duration-150 active:scale-95 shrink-0 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
              >
                <ZeltunIcon className="w-2.5 h-2.5 shrink-0" />
                <span>TUN</span>
              </button>
            )}
          </div>

          {/* Minimal HUD Telemetry (only when Zeltun is running live) */}
          {showZeltunTelemetry && tunStats && (
            <div className="px-3 pb-2 pt-1.5 border-t border-white/[0.08] space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
                <div className="text-white font-semibold truncate">
                  {formatCompactBytes(tunStats.rxBytes)}{' '}
                  <span className="text-zinc-500 font-normal">/</span>{' '}
                  {formatCompactBytes(tunStats.txBytes)}
                </div>
                <div className="text-zinc-300 shrink-0">
                  {tunStats.activeTcpConns} TCP · {tunStats.activeUdpSessions} UDP
                  {tunStats.droppedPackets > 0 && (
                    <span className="text-white ml-1.5">· {tunStats.droppedPackets} drop</span>
                  )}
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="h-[2px] w-full rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-white transition-[width] duration-300 shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                    style={{ width: `${proxyPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-zinc-400">
                  <span>Proxy {formatCompactBytes(tunStats.proxyBytes)} ({proxyPct}%)</span>
                  <span>Direct {formatCompactBytes(tunStats.directBytes)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Frosted Glass Engine Picker */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              role="listbox"
              aria-label="Select TUN Engine"
              initial={{ opacity: 0, y: -4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="absolute inset-x-0 top-full mt-1.5 z-40 rounded-2xl p-1.5 bg-[#15171e] border border-white/15 shadow-[0_18px_42px_rgba(0,0,0,0.82)] space-y-1"
            >
              <div className="px-2.5 pt-1 pb-0.5 flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">
                <span>Select TUN Engine</span>
                {isTunRunning && (
                  <span className="font-mono text-zinc-500 lowercase">auto-reloads</span>
                )}
              </div>

              {TUN_ENGINE_CORES.map((core) => {
                const selected = core.id === activeEngine;
                return (
                  <button
                    key={core.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onSwitchEngine(core.id);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
                      selected
                        ? 'bg-white/[0.12] border border-white/20 text-white'
                        : 'border border-transparent hover:bg-white/[0.06] text-zinc-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {core.name === 'Zeltun' ? (
                          <ZeltunIcon className="w-3 h-3 text-white shrink-0" />
                        ) : (
                          <Cpu className="w-3 h-3 text-zinc-300 shrink-0" />
                        )}
                        <span className="text-[11px] font-semibold text-white">{core.name}</span>
                        <span className="text-[8.5px] font-mono uppercase text-zinc-400">
                          {core.runtime}
                        </span>
                        {core.recommended && (
                          <span className="text-[8.5px] font-medium px-1.5 py-[1px] rounded bg-white/10 text-zinc-200 border border-white/15">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="text-[9.5px] text-zinc-400 truncate mt-0.5">{core.desc}</div>
                    </div>

                    {selected && <Check className="w-3 h-3 text-white shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
TunAdapterHeaderCard.displayName = 'TunAdapterHeaderCard';
