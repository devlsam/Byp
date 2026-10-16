import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Sliders, RefreshCw } from '../../icons';
import { AppService } from '../../../bindings/changeme';
import type { Settings } from '../../../bindings/changeme/internal/storage/models';

interface SocksTabProps {
  mode: string;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  onModeChange: (mode: string) => void;
  onResetNetwork: () => void;
}

/**
 * Operating mode, local inbound ports, and network reset tab.
 */
export const SocksTab: React.FC<SocksTabProps> = ({
  mode,
  settings,
  setSettings,
  onModeChange,
  onResetNetwork,
}) => {
  return (
    <motion.div
      key="socks"
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex-1 flex flex-col p-5 space-y-4 overflow-y-auto no-scrollbar"
    >
      <div className="flex flex-col space-y-1">
        <h2 className="text-sm font-semibold text-white tracking-tight flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-zinc-300" />
          <span>SOCKS & Inbound Settings</span>
        </h2>
        <p className="text-[11px] text-zinc-400 font-normal">
          Configure core operating mode, local SOCKS5/HTTP inbound ports, and network recovery.
        </p>
      </div>

      {/* Operating Mode Toggle */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5 px-1">
          <Shield className="w-3.5 h-3.5 text-zinc-300" />
          <span>Operating Mode</span>
        </span>

        <div className="grid grid-cols-3 gap-2 modern-surface p-1.5 rounded-2xl">
          {(['tun', 'proxy', 'core'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`py-2 px-1 rounded-xl text-center text-xs font-semibold uppercase transition-all ${
                mode === m
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {m === 'tun' ? 'TUN' : m === 'proxy' ? 'PROXY' : 'CORE'}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-400 px-1 leading-relaxed">
          {mode === 'tun' && 'TUN mode intercepts all system traffic via Wintun virtual network adapter.'}
          {mode === 'proxy' && 'PROXY mode sets Windows system proxy for HTTP and SOCKS5.'}
          {mode === 'core' && 'CORE mode keeps core engine active on local ports without system routing changes.'}
        </p>
      </div>

      {/* Inbound Ports */}
      <div className="modern-surface rounded-2xl p-4 space-y-3 border border-white/10">
        <span className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5">
          <Sliders className="w-3.5 h-3.5 text-zinc-300" />
          <span>Local Inbound Ports</span>
        </span>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">SOCKS5 Port</label>
            <input
              type="number"
              value={settings.socksPort}
              onChange={(e) =>
                setSettings({ ...settings, socksPort: parseInt(e.target.value) || 10808 })
              }
              className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white font-mono font-normal text-xs focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">HTTP Port</label>
            <input
              type="number"
              value={settings.httpPort}
              onChange={(e) =>
                setSettings({ ...settings, httpPort: parseInt(e.target.value) || 10809 })
              }
              className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white font-mono font-normal text-xs focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        <button
          onClick={async () => {
            await AppService.SaveSettings(settings);
          }}
          className="w-full py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white text-xs font-medium transition cursor-pointer"
        >
          Save Ports
        </button>
      </div>

      {/* Emergency Network Reset Button */}
      <div className="modern-surface rounded-2xl p-4 space-y-2 border border-rose-900/40">
        <span className="text-xs font-semibold text-rose-400 flex items-center space-x-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Emergency Network Reset</span>
        </span>
        <p className="text-[10px] text-zinc-400 font-normal leading-relaxed">
          Clears Windows system proxy and removes orphaned TUN routes immediately.
        </p>
        <button
          type="button"
          onClick={onResetNetwork}
          className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition flex items-center justify-center space-x-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Proxy & Routes</span>
        </button>
      </div>
    </motion.div>
  );
};
