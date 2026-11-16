import React, { useState, useEffect } from 'react';
import { Shield, Sliders, RefreshCw, Server, Check, AlertTriangle } from '../../icons';
import { AppService } from '../../../bindings/changeme';
import type { Settings } from '../../../bindings/changeme/internal/storage/models';
import type { UpstreamTestResult } from '../../../bindings/changeme/internal/tun/models';
import { toast } from '../../Toaster';

interface SocksTabProps {
  mode: string;
  connected: boolean;
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  onModeChange: (mode: string) => void;
  onResetNetwork: () => void;
}

const OPERATING_MODES = [
  { id: 'tun', label: 'TUN' },
  { id: 'upstream', label: 'Upstream' },
  { id: 'proxy', label: 'Proxy' },
  { id: 'core', label: 'Core' },
] as const;

/**
 * Operating mode, external TUN upstream target, local inbound ports, and network reset tab.
 */
export const SocksTab: React.FC<SocksTabProps> = React.memo(({
  mode,
  connected,
  settings,
  onUpdateSettings,
  onModeChange,
  onResetNetwork,
}) => {
  const [upstreamHostDraft, setUpstreamHostDraft] = useState<string>(
    settings.upstreamHost || '127.0.0.1'
  );
  const [upstreamPortDraft, setUpstreamPortDraft] = useState<string>(
    String(settings.upstreamPort || 10808)
  );
  const [socksPortDraft, setSocksPortDraft] = useState<string>(
    String(settings.socksPort || 10808)
  );
  const [httpPortDraft, setHttpPortDraft] = useState<string>(
    String(settings.httpPort || 10809)
  );

  const [testingUpstream, setTestingUpstream] = useState<boolean>(false);
  const [savingUpstream, setSavingUpstream] = useState<boolean>(false);
  const [savingPorts, setSavingPorts] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<UpstreamTestResult | null>(null);

  useEffect(() => {
    setUpstreamHostDraft(settings.upstreamHost || '127.0.0.1');
    setUpstreamPortDraft(String(settings.upstreamPort || 10808));
  }, [settings.upstreamHost, settings.upstreamPort]);

  useEffect(() => {
    setSocksPortDraft(String(settings.socksPort || 10808));
    setHttpPortDraft(String(settings.httpPort || 10809));
  }, [settings.socksPort, settings.httpPort]);

  const parseValidPort = (raw: string): number | null => {
    const parsed = parseInt(raw.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
      return null;
    }
    return parsed;
  };

  const handleTestUpstream = async () => {
    const port = parseValidPort(upstreamPortDraft);
    if (!port) {
      toast.error('Invalid Upstream Port', 'Enter a valid port between 1 and 65535.');
      return;
    }
    const host = upstreamHostDraft.trim() || '127.0.0.1';
    setTestingUpstream(true);
    try {
      const res = await AppService.TestUpstreamProxy(host, port);
      setProbeResult(res);
      if (res.socksReady) {
        toast.success('Upstream SOCKS5 Ready', `${res.target} responded in ${res.latencyMs}ms`);
      } else {
        toast.error('Upstream Check Failed', res.message);
      }
    } catch (err: any) {
      toast.error('Upstream Test Error', err?.message || String(err));
    } finally {
      setTestingUpstream(false);
    }
  };

  const handleSaveUpstream = async () => {
    const port = parseValidPort(upstreamPortDraft);
    if (!port) {
      toast.error('Invalid Upstream Port', 'Enter a valid port between 1 and 65535.');
      return;
    }
    const host = upstreamHostDraft.trim() || '127.0.0.1';
    setSavingUpstream(true);
    try {
      const ok = await onUpdateSettings({ upstreamHost: host, upstreamPort: port });
      if (ok) {
        setUpstreamHostDraft(host);
        toast.success(
          'Upstream Target Saved',
          connected && mode === 'upstream'
            ? `TUN reloaded cleanly to ${host}:${port}`
            : `TUN upstream set to ${host}:${port}`
        );
      }
    } finally {
      setSavingUpstream(false);
    }
  };

  const handleSaveLocalPorts = async () => {
    const nextSocks = parseValidPort(socksPortDraft);
    const nextHttp = parseValidPort(httpPortDraft);
    if (!nextSocks || !nextHttp) {
      toast.error('Invalid Port', 'SOCKS5 and HTTP ports must be between 1 and 65535.');
      return;
    }
    if (nextSocks === nextHttp) {
      toast.error('Port Conflict', 'SOCKS5 and HTTP ports cannot be identical.');
      return;
    }
    setSavingPorts(true);
    try {
      const ok = await onUpdateSettings({ socksPort: nextSocks, httpPort: nextHttp });
      if (ok) {
        toast.success(
          'Inbound Ports Saved',
          `SOCKS5: ${nextSocks} · HTTP: ${nextHttp} (applies on next Xray start)`
        );
      }
    } finally {
      setSavingPorts(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 space-y-3.5 overflow-y-auto no-scrollbar">
      <div className="flex flex-col space-y-1">
        <h2 className="text-sm font-semibold text-white tracking-tight flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-zinc-300" />
          <span>Inbound & Upstream Proxy</span>
        </h2>
        <p className="text-[11px] text-zinc-400 font-normal">
          Switch operating mode, route TUN through an external client proxy, or tune local ports.
        </p>
      </div>

      {/* Operating Mode Toggle */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5 px-1">
          <Shield className="w-3.5 h-3.5 text-zinc-300" />
          <span>Operating Mode</span>
        </span>

        <div className="grid grid-cols-4 gap-1.5 modern-surface p-1.5 rounded-2xl">
          {OPERATING_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onModeChange(m.id)}
              className={`py-2 px-1 rounded-xl text-center text-[11px] font-semibold uppercase tracking-tight cursor-pointer transition-colors ${
                mode === m.id
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-400 px-1 leading-relaxed">
          {mode === 'tun' &&
            'TUN mode starts built-in Xray and routes system traffic via the virtual Wintun adapter.'}
          {mode === 'upstream' &&
            'UPSTREAM mode uses ONLY TUN & Split Tunnel without starting Xray, forwarding traffic to any external SOCKS5 client.'}
          {mode === 'proxy' && 'PROXY mode sets Windows system proxy for HTTP and SOCKS5.'}
          {mode === 'core' &&
            'CORE mode keeps built-in Xray active on local ports without system routing changes.'}
        </p>
      </div>

      {/* External Upstream Proxy Target for UPSTREAM Mode */}
      <div
        className={`modern-surface rounded-2xl p-4 space-y-3 border ${
          mode === 'upstream' ? 'border-white/25' : 'border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-200 flex items-center space-x-1.5">
            <Server className="w-3.5 h-3.5 text-zinc-300" />
            <span>External TUN Upstream</span>
          </span>
          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 border border-white/10 whitespace-nowrap shrink-0">
            {mode === 'upstream' ? 'Active Target' : 'For Upstream Mode'}
          </span>
        </div>

        <p className="text-[10px] text-zinc-400 leading-relaxed">
          Point TUN to another client&apos;s SOCKS5 port (e.g. v2rayN, Clash, Nekoray, or SSH). No BYP config needed.
        </p>

        <div className="grid grid-cols-[1fr_98px] gap-2.5 text-xs">
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">
              Proxy IP / Host
            </label>
            <input
              type="text"
              value={upstreamHostDraft}
              onChange={(e) => {
                setUpstreamHostDraft(e.target.value);
                setProbeResult(null);
              }}
              placeholder="127.0.0.1"
              className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white font-mono font-normal text-xs focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">
              SOCKS5 Port
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={upstreamPortDraft}
              onChange={(e) => {
                setUpstreamPortDraft(e.target.value);
                setProbeResult(null);
              }}
              placeholder="10808"
              className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white font-mono font-normal text-xs focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        {probeResult && (
          <div
            className={`px-2.5 py-2 rounded-xl border text-[10.5px] flex items-center justify-between gap-2 ${
              probeResult.socksReady
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
            }`}
          >
            <div className="flex items-center space-x-1.5 min-w-0">
              {probeResult.socksReady ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate">{probeResult.message}</span>
            </div>
            {probeResult.socksReady && (
              <span className="font-mono text-[10px] shrink-0 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                {probeResult.latencyMs}ms
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={testingUpstream}
            onClick={handleTestUpstream}
            className="py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 text-xs font-medium cursor-pointer flex items-center justify-center space-x-1.5 active:scale-[0.99] will-change-transform transition-transform duration-150 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${testingUpstream ? 'animate-spin' : ''}`} />
            <span>{testingUpstream ? 'Testing...' : 'Test Proxy'}</span>
          </button>

          <button
            type="button"
            disabled={savingUpstream}
            onClick={handleSaveUpstream}
            className="py-2 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold cursor-pointer flex items-center justify-center space-x-1.5 active:scale-[0.99] will-change-transform transition-transform duration-150 disabled:opacity-50"
          >
            <Check className="w-3 h-3 stroke-[2.5]" />
            <span>{savingUpstream ? 'Saving...' : 'Save Upstream'}</span>
          </button>
        </div>
      </div>

      {/* Local Inbound Ports (Built-in Xray Core) */}
      <div className="modern-surface rounded-2xl p-4 space-y-3 border border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-zinc-300" />
            <span>Built-in Xray Inbound Ports</span>
          </span>
          <span className="text-[9.5px] font-mono text-zinc-500">127.0.0.1</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">SOCKS5 Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={socksPortDraft}
              onChange={(e) => setSocksPortDraft(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white font-mono font-normal text-xs focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">HTTP Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={httpPortDraft}
              onChange={(e) => setHttpPortDraft(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white font-mono font-normal text-xs focus:outline-none focus:border-white/40"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={savingPorts}
          onClick={handleSaveLocalPorts}
          className="w-full py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white text-xs font-medium cursor-pointer active:scale-[0.99] will-change-transform transition-transform duration-150 disabled:opacity-50"
        >
          {savingPorts ? 'Saving...' : 'Save Local Ports'}
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
          className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99] will-change-transform transition-transform duration-150"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Proxy & Routes</span>
        </button>
      </div>
    </div>
  );
});

SocksTab.displayName = 'SocksTab';
