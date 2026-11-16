import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import {
  ObjectUngroup,
  Trash2,
  FolderOpen,
  Cpu,
  Check,
  Monitor,
  Layers,
  Headphones,
  Gamepad,
  Globe,
  Radio,
  FileCode,
  Zap,
  Shield,
} from '../../icons';
import { POPULAR_PRESETS } from '../../constants/presets';
import { getAppVisual } from '../../utils/formatters';
import type { Settings } from '../../../bindings/changeme/internal/storage/models';
import type { WirePath, WireEndpoint } from '../../types';

interface SplitTabProps {
  settings: Settings;
  systemGateway: 'vpn' | 'direct';
  appRoutes: Record<string, 'vpn' | 'direct'>;
  mode: string;
  isActive?: boolean;
  onSwitchToTun?: () => void;
  applyVisualRouting: (
    newSystemGateway: 'vpn' | 'direct',
    newAppRoutes: Record<string, 'vpn' | 'direct'>,
    appsList: string[]
  ) => Promise<void>;
  onSelectExe: () => void;
  onOpenRunningApps: () => void;
  onAddPreset: (preset: { name: string; exe: string }) => void;
  onClearAllApps: () => void;
}

interface DragWireHandle {
  start: (startX: number, startY: number) => void;
  move: (x: number, y: number) => void;
  stop: () => void;
}

/**
 * Ref-driven SVG drag preview overlay so 120Hz mouse movement never triggers
 * React reconciliation across the application list or canvas.
 */
const DragWireOverlay = React.memo(
  forwardRef<DragWireHandle>((_, ref) => {
    const groupRef = useRef<SVGGElement>(null);
    const glowRef = useRef<SVGPathElement>(null);
    const dashRef = useRef<SVGPathElement>(null);
    const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const latestRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const rafRef = useRef<number | null>(null);

    const flush = useCallback(() => {
      rafRef.current = null;
      const sx = startRef.current.x;
      const sy = startRef.current.y;
      const cx = latestRef.current.x;
      const cy = latestRef.current.y;
      const dx = Math.max(20, (cx - sx) * 0.5);
      const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${cx - dx} ${cy}, ${cx} ${cy}`;
      glowRef.current?.setAttribute('d', d);
      dashRef.current?.setAttribute('d', d);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        start(x: number, y: number) {
          startRef.current = { x, y };
          latestRef.current = { x, y };
          if (groupRef.current) groupRef.current.style.display = 'inline';
          flush();
        },
        move(x: number, y: number) {
          latestRef.current = { x, y };
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flush);
          }
        },
        stop() {
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          if (groupRef.current) groupRef.current.style.display = 'none';
        },
      }),
      [flush]
    );

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    return (
      <g ref={groupRef} style={{ display: 'none' }}>
        <path
          ref={glowRef}
          d=""
          fill="none"
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path
          ref={dashRef}
          d=""
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
      </g>
    );
  })
);
DragWireOverlay.displayName = 'DragWireOverlay';

const EMPTY_APPS: string[] = [];

function areWirePathsEqual(a: WirePath[], b: WirePath[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].target !== b[i].target || a[i].pathD !== b[i].pathD) {
      return false;
    }
  }
  return true;
}

/**
 * Visual Flow Split Tunneling tab with interactive drag-and-drop routing and dynamic bezier wires.
 */
export const SplitTab: React.FC<SplitTabProps> = React.memo(({
  settings,
  systemGateway,
  appRoutes,
  mode,
  isActive = true,
  onSwitchToTun,
  applyVisualRouting,
  onSelectExe,
  onOpenRunningApps,
  onAddPreset,
  onClearAllApps,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appsScrollRef = useRef<HTMLDivElement>(null);
  const vpnDotRef = useRef<HTMLDivElement>(null);
  const directDotRef = useRef<HTMLDivElement>(null);
  const systemDotRef = useRef<HTMLDivElement>(null);
  const appDotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragOverlayRef = useRef<DragWireHandle>(null);
  const isDraggingRef = useRef<boolean>(false);
  const canvasRectCacheRef = useRef<DOMRect | null>(null);
  const wireRafRef = useRef<number | null>(null);

  const [wirePaths, setWirePaths] = useState<WirePath[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const configuredApps = settings.splitTunnelApps ?? EMPTY_APPS;

  const appItems = useMemo(
    () =>
      configuredApps.map((appPath) => ({
        appPath,
        visual: getAppVisual(appPath),
        baseName: appPath.split(/[\\/]/).pop() || appPath,
      })),
    [configuredApps]
  );

  const presetAddedMap = useMemo(() => {
    const lowerApps = configuredApps.map((a) => a.toLowerCase());
    const map: Record<string, boolean> = {};
    for (const p of POPULAR_PRESETS) {
      const exeLower = p.exe.toLowerCase();
      const nameLower = p.name.toLowerCase();
      map[p.id] = lowerApps.some((a) => a.includes(exeLower) || a.includes(nameLower));
    }
    return map;
  }, [configuredApps]);

  const updateWires = useCallback(() => {
    const canvasEl = canvasRef.current;
    const vpnDot = vpnDotRef.current;
    const directDot = directDotRef.current;
    if (!canvasEl || !vpnDot || !directDot) return;

    // Batch all DOM geometry reads before computing SVG paths to avoid layout thrashing
    const canvasRect = canvasEl.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    const vpnRect = vpnDot.getBoundingClientRect();
    const directRect = directDot.getBoundingClientRect();
    const systemDot = systemDotRef.current;
    const sysRect = systemDot ? systemDot.getBoundingClientRect() : null;
    const scrollContainer = appsScrollRef.current;
    const scrollRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;

    const dotRects: Array<{ appPath: string; rect: DOMRect }> = [];
    if (scrollRect) {
      for (const appPath of configuredApps) {
        const dot = appDotRefs.current.get(appPath);
        if (dot) {
          dotRects.push({ appPath, rect: dot.getBoundingClientRect() });
        }
      }
    }

    const vpnCenter = {
      x: vpnRect.left + vpnRect.width / 2 - canvasRect.left,
      y: vpnRect.top + vpnRect.height / 2 - canvasRect.top,
    };

    const directCenter = {
      x: directRect.left + directRect.width / 2 - canvasRect.left,
      y: directRect.top + directRect.height / 2 - canvasRect.top,
    };

    const endpoints: WireEndpoint[] = [];

    // 1. My System Wire
    if (sysRect && sysRect.width > 0 && sysRect.height > 0) {
      endpoints.push({
        id: 'system',
        target: systemGateway,
        x1: sysRect.left + sysRect.width / 2 - canvasRect.left,
        y1: sysRect.top + sysRect.height / 2 - canvasRect.top,
      });
    }

    // 2. Configured Apps Wires (Only if visible within scroll viewport)
    if (scrollRect) {
      for (const { appPath, rect: dotRect } of dotRects) {
        const isVisible =
          dotRect.bottom >= scrollRect.top - 4 && dotRect.top <= scrollRect.bottom + 4;
        if (isVisible && dotRect.width > 0 && dotRect.height > 0) {
          const target = appRoutes[appPath] || (systemGateway === 'vpn' ? 'direct' : 'vpn');
          endpoints.push({
            id: appPath,
            target,
            x1: dotRect.left + dotRect.width / 2 - canvasRect.left,
            y1: dotRect.top + dotRect.height / 2 - canvasRect.top,
          });
        }
      }
    }

    // Group endpoints by target to calculate smooth fan-out offsets along gateway dock
    const vpnEndpoints = endpoints.filter((e) => e.target === 'vpn');
    const directEndpoints = endpoints.filter((e) => e.target === 'direct');

    const computePaths = (
      list: WireEndpoint[],
      centerPos: { x: number; y: number },
      target: 'vpn' | 'direct'
    ) => {
      const count = list.length;
      if (count === 0) return [];
      const maxSpread = Math.min(26, (count - 1) * 3.5);

      return list.map((ep, idx) => {
        const offsetY = count <= 1 ? 0 : -maxSpread / 2 + (idx / (count - 1)) * maxSpread;
        const targetX = centerPos.x;
        const targetY = centerPos.y + offsetY;
        const dx = Math.max(16, (targetX - ep.x1) * 0.52);
        const pathD = `M ${ep.x1} ${ep.y1} C ${ep.x1 + dx} ${ep.y1}, ${targetX - dx} ${targetY}, ${targetX} ${targetY}`;
        return {
          id: ep.id,
          target,
          pathD,
        };
      });
    };

    const newPaths = [
      ...computePaths(vpnEndpoints, vpnCenter, 'vpn'),
      ...computePaths(directEndpoints, directCenter, 'direct'),
    ];

    setWirePaths((prev) => (areWirePathsEqual(prev, newPaths) ? prev : newPaths));
  }, [systemGateway, appRoutes, configuredApps]);

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const updateWiresRef = useRef(updateWires);
  updateWiresRef.current = updateWires;

  const lastMeasuredFnRef = useRef<(() => void) | null>(null);

  const scheduleWireUpdate = useCallback(() => {
    if (!isActiveRef.current) return;
    if (wireRafRef.current !== null) return;
    wireRafRef.current = requestAnimationFrame(() => {
      wireRafRef.current = null;
      if (isActiveRef.current) {
        updateWiresRef.current();
      }
    });
  }, []);

  // Recalculate wire positions when routes/apps change, when tab becomes visible, or once on idle pre-warm mount
  useEffect(() => {
    if (isActive) {
      lastMeasuredFnRef.current = updateWires;
      scheduleWireUpdate();
    } else if (lastMeasuredFnRef.current !== updateWires) {
      lastMeasuredFnRef.current = updateWires;
      if (wireRafRef.current === null) {
        wireRafRef.current = requestAnimationFrame(() => {
          wireRafRef.current = null;
          updateWiresRef.current();
        });
      }
    }
  }, [updateWires, scheduleWireUpdate, isActive]);

  // Attach resize / container observers once for the tab lifetime
  useEffect(() => {
    window.addEventListener('resize', scheduleWireUpdate);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
      ro = new ResizeObserver(() => {
        scheduleWireUpdate();
      });
      ro.observe(canvasRef.current);
      if (appsScrollRef.current) {
        ro.observe(appsScrollRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', scheduleWireUpdate);
      if (ro) ro.disconnect();
      if (wireRafRef.current !== null) {
        cancelAnimationFrame(wireRafRef.current);
        wireRafRef.current = null;
      }
    };
  }, [scheduleWireUpdate]);

  const handleToggleSystem = () => {
    const next: 'vpn' | 'direct' = systemGateway === 'vpn' ? 'direct' : 'vpn';
    applyVisualRouting(next, appRoutes, configuredApps);
  };

  const handleToggleApp = (appPath: string) => {
    const current = appRoutes[appPath] || (systemGateway === 'vpn' ? 'direct' : 'vpn');
    const next: 'vpn' | 'direct' = current === 'vpn' ? 'direct' : 'vpn';
    const updated = { ...appRoutes, [appPath]: next };
    applyVisualRouting(systemGateway, updated, configuredApps);
  };

  const handleDragMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || !canvasRectCacheRef.current) return;
    const rect = canvasRectCacheRef.current;
    dragOverlayRef.current?.move(e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      canvasRectCacheRef.current = null;
      dragOverlayRef.current?.stop();
      window.removeEventListener('mousemove', handleDragMouseMove);
    }
    setSelectedSourceId(null);
  }, [handleDragMouseMove]);

  const handleStartDrag = (
    _sourceType: 'system' | 'app',
    sourceId: string,
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    canvasRectCacheRef.current = canvasRect;
    isDraggingRef.current = true;
    const startX = e.clientX - canvasRect.left;
    const startY = e.clientY - canvasRect.top;

    window.addEventListener('mousemove', handleDragMouseMove, { passive: true });
    setSelectedSourceId(sourceId);
    dragOverlayRef.current?.start(startX, startY);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleCanvasMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleCanvasMouseUp);
      window.removeEventListener('mousemove', handleDragMouseMove);
    };
  }, [handleCanvasMouseUp, handleDragMouseMove]);

  const handleConnectToGateway = (target: 'vpn' | 'direct') => {
    if (!selectedSourceId) return;
    if (selectedSourceId === 'system') {
      applyVisualRouting(target, appRoutes, configuredApps);
    } else {
      const updated = { ...appRoutes, [selectedSourceId]: target };
      applyVisualRouting(systemGateway, updated, configuredApps);
    }
    setSelectedSourceId(null);
    handleCanvasMouseUp();
  };

  const handleRemoveApp = async (appToRemove: string) => {
    try {
      const updatedApps = configuredApps.filter((a) => a !== appToRemove);
      const updatedRoutes = { ...appRoutes };
      delete updatedRoutes[appToRemove];
      if (selectedSourceId === appToRemove) {
        setSelectedSourceId(null);
      }
      await applyVisualRouting(systemGateway, updatedRoutes, updatedApps);
    } catch (err: any) {
      console.error('Failed to remove app', err);
    }
  };

  const isTunMode = mode === 'tun' || mode === 'upstream';

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3.5 space-y-2 overflow-hidden">
      {/* Split Tunnel Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <ObjectUngroup className="w-4 h-4 text-zinc-300" />
          <h2 className="text-sm font-semibold text-white tracking-tight">Split Tunnel</h2>
        </div>
        <div className="flex items-center space-x-2">
          {settings.splitTunnelApps && settings.splitTunnelApps.length > 0 && (
            <button
              type="button"
              disabled={!isTunMode}
              onClick={onClearAllApps}
              className="text-[10px] text-zinc-400 hover:text-rose-400 cursor-pointer flex items-center space-x-1 disabled:opacity-30 disabled:pointer-events-none"
              title="Clear all configured applications"
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>Clear All</span>
            </button>
          )}
          <span className="text-[10px] text-zinc-400 font-mono">
            {settings.splitTunnelApps?.length || 0} apps configured
          </span>
        </div>
      </div>

      {/* TUN Mode Constraint Alert */}
      {!isTunMode && (
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between shadow-lg shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-semibold text-white">TUN Mode Required</span>
                <span className="text-[9px] font-mono uppercase bg-white/10 text-zinc-300 px-1.5 py-0.2 rounded border border-white/10">
                  Current: {mode.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Split tunneling routing is active in TUN and UPSTREAM modes.
              </p>
            </div>
          </div>
          {onSwitchToTun && (
            <button
              type="button"
              onClick={onSwitchToTun}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold will-change-transform transition-transform duration-150 active:scale-95 shadow-sm flex items-center space-x-1 shrink-0 cursor-pointer"
            >
              <Zap className="w-3 h-3 text-black fill-current" />
              <span>Switch to TUN</span>
            </button>
          )}
        </div>
      )}

      {/* Main interactive area: dimmed and disabled when not in TUN mode */}
      <div
        className={`flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden transition-opacity duration-200 relative ${
          !isTunMode ? 'opacity-40 pointer-events-none select-none' : ''
        }`}
      >
        {/* Sleek, Compact Action Bar */}
        <div className="modern-surface rounded-2xl p-2.5 border border-white/10 shrink-0 space-y-2">
        {/* 2-Button Action Bar (50/50 Grid) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSelectExe}
            title="Browse and add .exe file from disk"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white border border-white/10 text-[10px] font-medium flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm will-change-transform transition-transform duration-150 active:scale-[0.98]"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
            <span className="whitespace-nowrap">+ Add .exe</span>
          </button>
          <button
            type="button"
            onClick={onOpenRunningApps}
            title="Pick from currently running applications"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white border border-white/10 text-[10px] font-medium flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm will-change-transform transition-transform duration-150 active:scale-[0.98]"
          >
            <Cpu className="w-3.5 h-3.5 text-zinc-300" />
            <span className="whitespace-nowrap">+ Running Apps</span>
          </button>
        </div>

        {/* Quick-Add Popular Presets Pills */}
        <div className="grid grid-cols-4 gap-1.5">
          {POPULAR_PRESETS.map((p) => {
            const Icon = p.icon;
            const isAdded = Boolean(presetAddedMap[p.id]);
            return (
              <button
                key={p.id}
                type="button"
                disabled={isAdded}
                onClick={() => onAddPreset(p)}
                className={`py-1.5 px-1 rounded-lg border text-[9.5px] font-medium flex items-center justify-center space-x-1 ${
                  isAdded
                    ? 'bg-white/[0.02] border-white/5 text-zinc-600 cursor-default opacity-40'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-zinc-300 hover:text-white cursor-pointer will-change-transform transition-transform duration-150 active:scale-95'
                }`}
                title={isAdded ? `${p.name} added` : `Add ${p.name}`}
              >
                <Icon className="w-2.5 h-2.5 shrink-0 text-zinc-400" />
                <span className="whitespace-nowrap">{p.name}</span>
                {isAdded && <Check className="w-2 h-2 text-zinc-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual Flow Canvas */}
      <div
        ref={canvasRef}
        onMouseUp={handleCanvasMouseUp}
        className="canvas-dotted-grid rounded-2xl border border-white/10 flex-1 min-h-0 relative overflow-hidden flex select-none"
        style={{ touchAction: 'none' }}
      >
        {/* SVG Curved Bezier Connecting Wires Overlay (no SVG filters, no clipPath, zero idle loop) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          style={{ contain: 'strict' }}
        >
          <g>
            {wirePaths.map(({ id, target, pathD }) => {
              const isSelected = selectedSourceId === id;
              const isVpn = target === 'vpn';
              const strokeColor = isVpn ? '#ffffff' : '#a1a1aa';
              const bgStroke = isVpn
                ? isSelected
                  ? 'rgba(255, 255, 255, 0.34)'
                  : 'rgba(255, 255, 255, 0.16)'
                : 'rgba(161, 161, 170, 0.1)';

              return (
                <g key={id}>
                  {/* Soft aura stroke replacing SVG feDropShadow rasterization */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={bgStroke}
                    strokeWidth={isSelected ? 5.5 : 4}
                    strokeLinecap="round"
                  />
                  {/* Crisp dashed routing line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 2.4 : 1.7}
                    className="wire-stroke"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Ref-driven interactive dragging wire (zero React re-renders on mousemove) */}
            <DragWireOverlay ref={dragOverlayRef} />
          </g>
        </svg>

        {/* Left Column: Traffic Sources (Pinned My System + Configured App Nodes) */}
        <div className="w-[204px] h-full flex flex-col p-2 z-10 min-h-0">
          {/* Pinned "My System" Node */}
          <div
            onClick={handleToggleSystem}
            onMouseDown={(e) => handleStartDrag('system', 'system', e)}
            className={`contain-row h-[48px] mr-4 p-2 rounded-xl relative group cursor-pointer shrink-0 border flex items-center justify-between ${
              selectedSourceId === 'system'
                ? 'bg-white/[0.12] border-white/75 shadow-[0_0_14px_rgba(255,255,255,0.16)]'
                : systemGateway === 'vpn'
                ? 'bg-white/[0.08] border-white/30 shadow-[0_0_12px_rgba(255,255,255,0.06)]'
                : 'bg-white/[0.03] border-white/10 hover:border-white/20'
            }`}
            title="Click card to toggle route between VPN & Direct"
          >
            <div className="flex items-center space-x-2 min-w-0 flex-1 pr-1.5">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                  systemGateway === 'vpn'
                    ? 'bg-white/10 border-white/25 text-white'
                    : 'bg-white/5 border-white/10 text-zinc-400'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold text-white truncate">My System</div>
                <div className="text-[8.5px] text-zinc-400 truncate">Default Windows Traffic</div>
              </div>
            </div>

            <div className="shrink-0">
              <span
                className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-bold uppercase border ${
                  systemGateway === 'vpn'
                    ? 'bg-white text-black border-white'
                    : 'bg-white/10 text-zinc-400 border-white/10'
                }`}
              >
                {systemGateway === 'vpn' ? 'VPN' : 'DIRECT'}
              </span>
            </div>

            {/* Right Connection Socket */}
            <div
              ref={systemDotRef}
              id="dot-source-system"
              className={`absolute -right-1.5 top-1/2 -translate-y-1/2 z-10 w-3 h-3 rounded-full border-2 border-[#0b0c10] shadow-md ${
                systemGateway === 'vpn' ? 'bg-white ring-2 ring-white/50' : 'bg-zinc-500 ring-2 ring-white/20'
              }`}
            />
          </div>

          {/* Section Divider */}
          <div className="flex items-center justify-between px-1 mr-4 pt-1.5 pb-0.5 shrink-0 text-zinc-500">
            <span className="text-[9px] font-semibold uppercase tracking-wider">Configured Apps</span>
            <span className="text-[9px] font-mono">{configuredApps.length}</span>
          </div>

          {/* Scrollable Configured App Nodes */}
          <div
            ref={appsScrollRef}
            onScroll={scheduleWireUpdate}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5 py-1 px-1 -mx-1"
          >
            {appItems.length === 0 ? (
              <div className="h-full min-h-[140px] mr-4 flex flex-col items-center justify-center text-center p-3 rounded-xl bg-black/20 border border-white/5 space-y-1 text-zinc-500">
                <Layers className="w-5 h-5 text-zinc-600 mb-0.5" />
                <span className="text-[10px] font-medium text-zinc-400">No custom apps</span>
                <span className="text-[9px] text-zinc-500 leading-tight">
                  Use + Add .exe or quick presets above
                </span>
              </div>
            ) : (
              appItems.map(({ appPath, visual, baseName }, idx) => {
                const currentRoute = appRoutes[appPath] || (systemGateway === 'vpn' ? 'direct' : 'vpn');
                const isVpn = currentRoute === 'vpn';
                const isSelected = selectedSourceId === appPath;

                return (
                  <div
                    key={appPath}
                    onClick={() => handleToggleApp(appPath)}
                    onMouseDown={(e) => handleStartDrag('app', appPath, e)}
                    className={`contain-row h-[46px] mr-4 rounded-xl relative group cursor-pointer border flex items-center justify-between px-2 ${
                      isSelected
                        ? 'bg-white/[0.12] border-white/75 shadow-[0_0_12px_rgba(255,255,255,0.16)] text-white'
                        : isVpn
                        ? 'bg-white/[0.08] border-white/25 hover:border-white/40 text-white'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-zinc-300'
                    }`}
                    title="Click card to toggle between VPN & Direct"
                  >
                    {/* Left: Icon + Text */}
                    <div className="flex items-center space-x-2 min-w-0 flex-1 pr-1.5">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                          isVpn
                            ? 'bg-white/10 border-white/20 text-white'
                            : 'bg-white/5 border-white/10 text-zinc-400'
                        }`}
                      >
                        {visual.iconType === 'chat' && <Headphones className="w-3 h-3" />}
                        {visual.iconType === 'game' && <Gamepad className="w-3 h-3" />}
                        {visual.iconType === 'browser' && <Globe className="w-3 h-3" />}
                        {visual.iconType === 'music' && <Radio className="w-3 h-3" />}
                        {visual.iconType === 'code' && <FileCode className="w-3 h-3" />}
                        {visual.iconType === 'default' && <Layers className="w-3 h-3" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold text-white truncate" title={visual.name}>
                          {visual.name}
                        </div>
                        <div className="text-[8px] text-zinc-400 truncate font-mono" title={appPath}>
                          {baseName}
                        </div>
                      </div>
                    </div>

                    {/* Right: Badge & Dedicated Delete Button */}
                    <div className="flex items-center space-x-1 shrink-0">
                      <span
                        className={`text-[7.5px] font-mono px-1 py-0.5 rounded font-bold uppercase border ${
                          isVpn
                            ? 'bg-white text-black border-white'
                            : 'bg-white/10 text-zinc-400 border-white/10'
                        }`}
                      >
                        {isVpn ? 'VPN' : 'DIRECT'}
                      </span>

                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveApp(appPath);
                        }}
                        className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-rose-500/20 cursor-pointer"
                        title="Remove application rule"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* Right Connection Socket */}
                    <div
                      ref={(el) => {
                        if (el) appDotRefs.current.set(appPath, el);
                        else appDotRefs.current.delete(appPath);
                      }}
                      id={`dot-app-${idx}`}
                      data-app-path={appPath}
                      className={`absolute -right-1.5 top-1/2 -translate-y-1/2 z-10 w-3 h-3 rounded-full border-2 border-[#0b0c10] shadow-md ${
                        isVpn ? 'bg-white ring-2 ring-white/50' : 'bg-zinc-500 ring-2 ring-white/20'
                      }`}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center Spacer for Bezier Wires */}
        <div className="flex-1 pointer-events-none" />

        {/* Right Column: 2 Fixed Gateways (VPN Tunnel & Direct Internet) */}
        <div className="w-[94px] h-full flex flex-col justify-around py-5 pr-2 z-10 shrink-0">
          {/* VPN Tunnel Gateway Node */}
          <div
            id="node-gateway-vpn"
            onClick={() => handleConnectToGateway('vpn')}
            onMouseUp={() => handleConnectToGateway('vpn')}
            className="p-2 rounded-2xl border cursor-pointer relative bg-white/[0.07] hover:bg-white/[0.12] border-white/25 hover:border-white/45 shadow-[0_0_20px_rgba(255,255,255,0.08)] flex flex-col items-center text-center space-y-1 group will-change-transform transition-transform duration-150 active:scale-[0.98]"
            title="Click to route selected traffic to VPN Tunnel"
          >
            {/* Left Connection Dock Socket */}
            <div
              ref={vpnDotRef}
              id="dot-gateway-vpn"
              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 rounded-full border-2 border-[#0b0c10] bg-white ring-2 ring-white/50 shadow-md group-hover:scale-110"
            />

            <div className="w-7 h-7 rounded-xl bg-white/15 border border-white/30 text-white flex items-center justify-center shadow-inner">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10.5px] font-bold text-white tracking-tight">VPN Tunnel</div>
              <div className="text-[8px] text-zinc-400 font-medium">Encrypted</div>
            </div>
          </div>

          {/* Direct Internet Gateway Node */}
          <div
            id="node-gateway-direct"
            onClick={() => handleConnectToGateway('direct')}
            onMouseUp={() => handleConnectToGateway('direct')}
            className="p-2 rounded-2xl border cursor-pointer relative bg-white/[0.03] hover:bg-white/[0.07] border-white/10 hover:border-white/25 shadow-sm flex flex-col items-center text-center space-y-1 group will-change-transform transition-transform duration-150 active:scale-[0.98]"
            title="Click to route selected traffic directly to Internet"
          >
            {/* Left Connection Dock Socket */}
            <div
              ref={directDotRef}
              id="dot-gateway-direct"
              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 rounded-full border-2 border-[#0b0c10] bg-zinc-500 ring-2 ring-white/20 shadow-md group-hover:scale-110"
            />

            <div className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 text-zinc-400 flex items-center justify-center shadow-inner">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10.5px] font-bold text-zinc-300 tracking-tight">Direct Net</div>
              <div className="text-[8px] text-zinc-500 font-medium">Bypass ISP</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
});

SplitTab.displayName = 'SplitTab';
