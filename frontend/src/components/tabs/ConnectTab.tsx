import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Lottie, type LottieHandle } from 'lottie-react';
import connectLottie from '../../assets/connect_lottie.json';

const LOTTIE_RENDERER_SETTINGS = {
  clearCanvas: true,
  dpr: typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 2) : 2,
};

function seekAbsoluteRestingFrame(handle: LottieHandle, frame: 0 | 50) {
  const item = handle.animationItem;
  if (item) {
    // Always reset segment bounds before seeking so frame indices are absolute across [0..100]
    item.resetSegments(true);
    item.setDirection(1);
    item.goToAndStop(frame, true);
    return;
  }
  handle.setDirection('forward');
  handle.resetSegments();
  handle.seek(frame);
  handle.pause();
}

function transitionLottieToState(handle: LottieHandle, nextConnected: boolean) {
  const item = handle.animationItem;
  if (!item) {
    handle.playSegments(nextConnected ? [0, 50] : [60, 100], { queue: false });
    return;
  }

  const rawPos = item.isSubframeEnabled ? item.currentRawFrame : item.currentFrame;
  const absFrame = item.firstFrame + rawPos;

  if (nextConnected) {
    if (absFrame <= 1 || absFrame >= 98.5) {
      handle.playSegments([0, 50], { queue: false });
      return;
    }
    if (absFrame >= 49 && absFrame <= 60.9) {
      seekAbsoluteRestingFrame(handle, 50);
      return;
    }
    if (absFrame > 60.9 && absFrame < 98.5) {
      // Reverse smoothly from mid-disconnect right back into steady locked frame 60
      const start = Math.max(61, Math.min(99, Math.round(absFrame)));
      handle.playSegments([start, 60], { queue: false });
      return;
    }
    const start = Math.max(0, Math.min(49, Math.round(absFrame)));
    handle.playSegments([start, 50], { queue: false });
    return;
  }

  if (absFrame >= 39.5 && absFrame <= 60.5) {
    handle.playSegments([60, 100], { queue: false });
    return;
  }
  if (absFrame > 60.5 && absFrame < 99) {
    const start = Math.max(60, Math.min(99, Math.round(absFrame)));
    handle.playSegments([start, 100], { queue: false });
    return;
  }
  if (absFrame >= 1.5 && absFrame < 39.5) {
    // Reverse smoothly from mid-connect windup back to idle 0 instead of snapping to frame 60
    const start = Math.max(2, Math.min(39, Math.round(absFrame)));
    handle.playSegments([start, 0], { queue: false });
    return;
  }
  seekAbsoluteRestingFrame(handle, 0);
}
import { Shield, ChevronRight, ZeltunIcon } from '../../icons';
import { LiveTrafficStats } from '../common/LiveTrafficStats';
import { formatTimer } from '../../utils/formatters';
import { AppService } from '../../../bindings/changeme';
import type { Profile } from '../../../bindings/changeme/internal/storage/models';
import type { UpstreamTestResult } from '../../../bindings/changeme/internal/tun/models';
import type { AppTab } from '../../types';

interface ConnectTabProps {
  connected: boolean;
  connectedAt?: number | null;
  isActive?: boolean;
  mode: string;
  sessionSeconds?: number;
  activeProfile?: Profile;
  profiles: Profile[];
  selectedProfileId: string;
  upstreamHost?: string;
  upstreamPort?: number;
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
 * Isolated timer component that computes elapsed seconds from connectedAt and
 * only ticks while the Connect tab is visible.
 */
const SessionTimer: React.FC<{
  connected: boolean;
  connectedAt?: number | null;
  isActive: boolean;
}> = React.memo(({ connected, connectedAt, isActive }) => {
  const [seconds, setSeconds] = useState(() =>
    connected && connectedAt ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)) : 0
  );

  useEffect(() => {
    if (!connected) {
      setSeconds(0);
      return;
    }

    const origin = connectedAt || Date.now();
    const syncElapsed = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - origin) / 1000)));
    };

    syncElapsed();
    if (!isActive) return;

    const timer = setInterval(syncElapsed, 1000);
    return () => clearInterval(timer);
  }, [connected, connectedAt, isActive]);

  if (!connected) return null;

  return (
    <>
      <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
      <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
        CONNECTED
      </span>
      <span className="text-white/30">•</span>
      <span className="font-mono text-zinc-300 text-[11px] font-medium">
        {formatTimer(seconds)}
      </span>
    </>
  );
});

SessionTimer.displayName = 'SessionTimer';

/**
 * Connect and traffic monitoring dashboard tab.
 */
export const ConnectTab: React.FC<ConnectTabProps> = React.memo(({
  connected,
  connectedAt,
  isActive = true,
  mode,
  activeProfile,
  profiles,
  selectedProfileId,
  upstreamHost = '127.0.0.1',
  upstreamPort = 10808,
  showQuickPicker,
  setShowQuickPicker,
  onToggleConnect,
  onModeChange,
  onSelectTab,
  onSelectProfile,
  onPing,
  pingingMap,
}) => {
  const lottieRef = useRef<LottieHandle>(null);
  const isFirstMount = useRef(true);
  const isReadyRef = useRef(false);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const prevConnectedRef = useRef(connected);
  const [testingUpstream, setTestingUpstream] = useState(false);
  const [upstreamProbe, setUpstreamProbe] = useState<UpstreamTestResult | null>(null);

  const cleanUpstreamHost = upstreamHost?.trim() || '127.0.0.1';
  const cleanUpstreamPort = upstreamPort > 0 ? upstreamPort : 10808;

  useEffect(() => {
    setUpstreamProbe(null);
  }, [cleanUpstreamHost, cleanUpstreamPort]);

  const handleTestUpstream = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (testingUpstream) return;
    setTestingUpstream(true);
    try {
      const res = await AppService.TestUpstreamProxy(cleanUpstreamHost, cleanUpstreamPort);
      setUpstreamProbe(res);
    } catch {
      setUpstreamProbe(null);
    } finally {
      setTestingUpstream(false);
    }
  };

  const handleCycleMode = () => {
    const next =
      mode === 'tun'
        ? 'upstream'
        : mode === 'upstream'
        ? 'proxy'
        : 'tun';
    onModeChange(next);
  };

  const handleAnimationReady = useCallback(() => {
    isReadyRef.current = true;
    const handle = lottieRef.current;
    const latestConnected = connectedRef.current;
    if (handle) {
      if (isFirstMount.current || latestConnected === prevConnectedRef.current) {
        seekAbsoluteRestingFrame(handle, latestConnected ? 50 : 0);
      } else {
        transitionLottieToState(handle, latestConnected);
      }
    }
    prevConnectedRef.current = latestConnected;
  }, []);

  const lottieSubscriptions = useMemo(
    () => ({ ready: handleAnimationReady }),
    [handleAnimationReady]
  );

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      prevConnectedRef.current = connected;
      return;
    }

    if (!isReadyRef.current || !lottieRef.current) return;

    if (connected !== prevConnectedRef.current) {
      prevConnectedRef.current = connected;
      transitionLottieToState(lottieRef.current, connected);
    }
  }, [connected]);

  return (
    <div className="flex-1 flex flex-col p-5 space-y-5 overflow-y-auto no-scrollbar">
      {/* Top Bar: Clean modern header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight text-white leading-tight">
            Dashboard
          </h1>
          <p className="text-[11px] text-zinc-400 font-medium tracking-normal mt-0.5">
            {connected
              ? mode === 'upstream'
                ? 'Upstream TUN Service Active'
                : 'Encrypted Tunnel Active'
              : 'Ready to Connect'}
          </p>
        </div>

        {/* Mode Toggle Glass Pill */}
        <button
          onClick={handleCycleMode}
          title="Click to switch mode (TUN / UPSTREAM / PROXY)"
          className="text-[10px] font-mono font-semibold uppercase px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 hover:text-white flex items-center space-x-1 shadow-sm cursor-pointer"
        >
          {mode === 'tun' || mode === 'upstream' ? (
            <ZeltunIcon className="w-3 h-3 text-white shrink-0" />
          ) : (
            <Shield className="w-3 h-3 text-white shrink-0" />
          )}
          <span>{mode.toUpperCase()}</span>
        </button>
      </div>

      {/* HERO CONNECT BUTTON SECTION */}
      <div className="flex flex-col items-center justify-center py-2">
        <button
          type="button"
          onClick={onToggleConnect}
          aria-label={connected ? 'Disconnect from VPN' : 'Connect to VPN'}
          className="relative flex items-center justify-center p-0 bg-transparent border-0 outline-none cursor-pointer group focus:outline-none will-change-transform transition-transform duration-300 hover:scale-105 active:scale-95"
        >
          {/* Subtle Ambient Radial Glow behind the icon when connected (no blur filter cost) */}
          <div
            className={`absolute w-36 h-36 rounded-full will-change-[opacity,transform] transition-[opacity,transform] duration-500 pointer-events-none -z-10 ${
              connected ? 'opacity-100 scale-110' : 'opacity-0 scale-90'
            }`}
            style={{
              contain: 'layout style paint',
              background:
                'radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 48%, transparent 72%)',
            }}
          />

          <Lottie
            lottieRef={lottieRef}
            src={connectLottie}
            renderer="canvas"
            rendererSettings={LOTTIE_RENDERER_SETTINGS}
            autoplay={false}
            loop={false}
            subscriptions={lottieSubscriptions}
            style={{ contain: 'layout style paint', willChange: 'transform, opacity' }}
            className={`w-40 h-40 select-none pointer-events-none transition-opacity duration-200 ${
              connected
                ? 'opacity-100 drop-shadow-[0_0_16px_rgba(255,255,255,0.5)]'
                : 'opacity-75 group-hover:opacity-100'
            }`}
          />
        </button>

        {/* Status & Session Duration below the button */}
        <div className="mt-3 h-5 flex items-center justify-center space-x-2 text-xs">
          {connected ? (
            <SessionTimer connected={connected} connectedAt={connectedAt} isActive={isActive} />
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[11px]">
                DISCONNECTED
              </span>
            </>
          )}
        </div>
      </div>

      {/* ACTIVE CONFIG OR UPSTREAM TARGET SELECTOR */}
      {mode === 'upstream' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
            <span>Upstream Proxy Target</span>
            <button
              onClick={() => onSelectTab('socks')}
              className="text-zinc-300 hover:text-white text-[11px] font-medium flex items-center space-x-0.5 cursor-pointer"
            >
              <span>Configure</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div
            onClick={() => onSelectTab('socks')}
            className="modern-surface-interactive rounded-2xl p-3.5 flex items-center justify-between gap-2.5 cursor-pointer group"
          >
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  connected
                    ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]'
                    : upstreamProbe?.socksReady
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                    : 'bg-white/40'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className="text-xs font-semibold text-white truncate">
                    Upstream Proxy
                  </span>
                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-zinc-200 font-semibold border border-white/10 whitespace-nowrap shrink-0">
                    SOCKS5
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono font-normal truncate mt-0.5">
                  socks5://{cleanUpstreamHost}:{cleanUpstreamPort}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleTestUpstream}
                disabled={testingUpstream}
                title={upstreamProbe?.message || 'Test external SOCKS5 proxy availability'}
                className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-lg border cursor-pointer select-none will-change-transform transition-transform duration-150 ${
                  testingUpstream
                    ? 'bg-white/20 text-white border-white/30'
                    : upstreamProbe?.socksReady
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 active:scale-95'
                    : upstreamProbe && !upstreamProbe.socksReady
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25 active:scale-95'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white hover:bg-white/10 active:scale-95'
                }`}
              >
                {testingUpstream
                  ? '...'
                  : upstreamProbe?.socksReady
                  ? `${upstreamProbe.latencyMs}ms`
                  : upstreamProbe
                  ? 'ERR'
                  : 'Test'}
              </button>
              <span className="text-[10px] px-2.5 py-1 rounded-xl bg-white/10 text-zinc-200 font-medium group-hover:bg-white/20 group-hover:text-white border border-white/10">
                Edit
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
          <span>Selected Config</span>
          <button
            onClick={() => onSelectTab('configs')}
            className="text-zinc-300 hover:text-white text-[11px] font-medium flex items-center space-x-0.5"
          >
            <span>All Nodes</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div
          onClick={() => setShowQuickPicker(!showQuickPicker)}
          className="modern-surface-interactive rounded-2xl p-3.5 flex items-center justify-between cursor-pointer group"
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
                className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-lg border cursor-pointer select-none will-change-transform transition-transform duration-150 ${
                  pingingMap?.[activeProfile.id]
                    ? 'bg-white/20 text-white border-white/30'
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
            <span className="text-[10px] px-2.5 py-1 rounded-xl bg-white/10 text-zinc-200 font-medium group-hover:bg-white/20 group-hover:text-white border border-white/10">
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
                  className={`contain-row p-2.5 rounded-xl flex items-center justify-between text-xs cursor-pointer font-medium ${
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
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                      pingingMap?.[p.id]
                        ? 'bg-white/20 text-white border-white/30'
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
      )}

      {/* DATA USAGE & SPEED COUNTERS */}
      <LiveTrafficStats isActive={isActive} mode={mode} connected={connected} />
    </div>
  );
});

ConnectTab.displayName = 'ConnectTab';
