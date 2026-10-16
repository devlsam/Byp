import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Power, ChevronRight } from '../../icons';
import { LiveTrafficStats } from '../common/LiveTrafficStats';
import { formatTimer } from '../../utils/formatters';
import type { Profile } from '../../../bindings/changeme/internal/storage/models';
import type { AppTab } from '../../types';

interface ConnectTabProps {
  connected: boolean;
  mode: string;
  sessionSeconds: number;
  activeProfile?: Profile;
  profiles: Profile[];
  selectedProfileId: string;
  showQuickPicker: boolean;
  setShowQuickPicker: (show: boolean) => void;
  onToggleConnect: () => void;
  onModeChange: (mode: string) => void;
  onSelectTab: (tab: AppTab) => void;
  onSelectProfile: (id: string) => void;
  onPing?: (id: string, e?: React.MouseEvent) => void;
  pingingMap?: Record<string, boolean>;
}

/**
 * Connect and traffic monitoring dashboard tab.
 */
export const ConnectTab: React.FC<ConnectTabProps> = ({
  connected,
  mode,
  sessionSeconds,
  activeProfile,
  profiles,
  selectedProfileId,
  showQuickPicker,
  setShowQuickPicker,
  onToggleConnect,
  onModeChange,
  onSelectTab,
  onSelectProfile,
  onPing,
  pingingMap,
}) => {
  return (
    <motion.div
      key="connect"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex-1 flex flex-col p-5 space-y-5 overflow-y-auto no-scrollbar"
    >
      {/* Top Bar: Clean modern header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight text-white leading-tight">
            Dashboard
          </h1>
          <p className="text-[11px] text-zinc-400 font-medium tracking-normal mt-0.5">
            {connected ? 'Encrypted Tunnel Active' : 'Ready to Connect'}
          </p>
        </div>

        {/* Mode Toggle Glass Pill */}
        <button
          onClick={() => onModeChange(mode === 'tun' ? 'proxy' : 'tun')}
          className="text-[10px] font-mono font-semibold uppercase px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 hover:text-white transition flex items-center space-x-1 shadow-sm"
        >
          <Shield className="w-3 h-3 text-white" />
          <span>{mode.toUpperCase()}</span>
        </button>
      </div>

      {/* HERO CONNECT BUTTON SECTION */}
      <div className="flex flex-col items-center justify-center py-2">
        {/* Frosted Glass Power Button */}
        <button
          onClick={onToggleConnect}
          className={`w-36 h-36 rounded-full flex items-center justify-center btn-power-transition cursor-pointer transform ${
            connected
              ? 'glass-btn-active scale-[1.05]'
              : 'glass-btn-idle hover:scale-[1.02]'
          }`}
        >
          <Power
            className={`w-12 h-12 transition-all ${
              connected
                ? 'text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.95)]'
                : 'text-white/60 hover:text-white'
            }`}
          />
        </button>

        {/* Status & Session Duration below the button */}
        <div className="mt-4 h-5 flex items-center justify-center space-x-2 text-xs">
          {connected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
                CONNECTED
              </span>
              <span className="text-white/30">•</span>
              <span className="font-mono text-zinc-300 text-[11px] font-medium">
                {formatTimer(sessionSeconds)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* ACTIVE CONFIG SELECTOR */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
          <span>Selected Config</span>
          <button
            onClick={() => onSelectTab('configs')}
            className="text-zinc-300 hover:text-white text-[11px] font-medium flex items-center space-x-0.5 transition"
          >
            <span>All Nodes</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div
          onClick={() => setShowQuickPicker(!showQuickPicker)}
          className="modern-surface rounded-2xl p-3.5 flex items-center justify-between cursor-pointer transition group"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                connected ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]' : 'bg-white/40'
              }`}
            />
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-semibold text-white truncate max-w-[170px]">
                  {activeProfile ? activeProfile.name : 'Choose a Config'}
                </span>
                {activeProfile && (
                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-zinc-200 font-semibold border border-white/10">
                    {activeProfile.protocol}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-zinc-400 font-mono font-normal truncate mt-0.5">
                {activeProfile ? `${activeProfile.server}:${activeProfile.port}` : 'Click to select node'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeProfile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPing?.(activeProfile.id, e);
                }}
                disabled={pingingMap?.[activeProfile.id]}
                title="Click to test latency (Ping)"
                className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-lg border transition cursor-pointer select-none ${
                  pingingMap?.[activeProfile.id]
                    ? 'bg-white/20 text-white animate-pulse border-white/30'
                    : activeProfile.ping > 0
                    ? 'bg-white/10 text-zinc-200 border-white/15 hover:bg-white/20 hover:text-white hover:border-white/30 active:scale-95'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white hover:bg-white/10 active:scale-95'
                }`}
              >
                {pingingMap?.[activeProfile.id]
                  ? '...'
                  : activeProfile.ping > 0
                  ? `${activeProfile.ping}ms`
                  : 'Ping'}
              </button>
            )}
            <span className="text-[10px] px-2.5 py-1 rounded-xl bg-white/10 text-zinc-200 font-medium group-hover:bg-white/20 group-hover:text-white transition border border-white/10">
              Switch
            </span>
          </div>
        </div>

        {/* Quick Config Dropdown */}
        {showQuickPicker && (
          <div className="modern-surface rounded-2xl p-2 space-y-1 max-h-44 overflow-y-auto no-scrollbar shadow-2xl">
            {profiles.length === 0 ? (
              <div className="text-xs text-zinc-400 font-medium p-3 text-center">No configs available.</div>
            ) : (
              profiles.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectProfile(p.id)}
                  className={`p-2.5 rounded-xl flex items-center justify-between text-xs cursor-pointer transition font-medium ${
                    selectedProfileId === p.id
                      ? 'bg-white/[0.14] border border-white/20 text-white font-semibold shadow-sm'
                      : 'hover:bg-white/[0.08] text-white/80'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <span className="truncate max-w-[170px]">{p.name}</span>
                    <span className="text-[9px] font-mono uppercase opacity-75 font-semibold shrink-0">
                      {p.protocol}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPing?.(p.id, e);
                    }}
                    disabled={pingingMap?.[p.id]}
                    title="Test ping"
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition shrink-0 ${
                      pingingMap?.[p.id]
                        ? 'bg-white/20 text-white animate-pulse border-white/30'
                        : p.ping > 0
                        ? 'bg-white/10 text-zinc-200 border-white/15 hover:bg-white/20 hover:text-white'
                        : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {pingingMap?.[p.id] ? '...' : p.ping > 0 ? `${p.ping}ms` : 'Ping'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* DATA USAGE & SPEED COUNTERS */}
      <LiveTrafficStats />
    </motion.div>
  );
};
