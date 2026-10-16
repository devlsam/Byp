import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
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

/**
 * Visual Flow Split Tunneling tab with interactive drag-and-drop routing and dynamic bezier wires.
 */
export const SplitTab: React.FC<SplitTabProps> = ({
  settings,
  systemGateway,
  appRoutes,
  mode,
  onSwitchToTun,
  applyVisualRouting,
  onSelectExe,
  onOpenRunningApps,
  onAddPreset,
  onClearAllApps,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appsScrollRef = useRef<HTMLDivElement>(null);
  const [wirePaths, setWirePaths] = useState<WirePath[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [dragWire, setDragWire] = useState<{
    active: boolean;
    sourceId: string;
    sourceType: 'system' | 'app';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const updateWires = useCallback(() => {
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    const vpnDot = document.getElementById('dot-gateway-vpn');
    const directDot = document.getElementById('dot-gateway-direct');
    if (!vpnDot || !directDot) return;

    const vpnRect = vpnDot.getBoundingClientRect();
    const directRect = directDot.getBoundingClientRect();

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
    const systemDot = document.getElementById('dot-source-system');
    if (systemDot) {
      const sysRect = systemDot.getBoundingClientRect();
      if (sysRect.width > 0 && sysRect.height > 0) {
        endpoints.push({
          id: 'system',
          target: systemGateway,
          x1: sysRect.left + sysRect.width / 2 - canvasRect.left,
          y1: sysRect.top + sysRect.height / 2 - canvasRect.top,
        });
      }
    }

    // 2. Configured Apps Wires (Only if visible within scroll viewport)
    const scrollContainer = appsScrollRef.current;
    const scrollRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;
    const currentApps = settings.splitTunnelApps || [];

    currentApps.forEach((appPath, idx) => {
      const target = appRoutes[appPath] || (systemGateway === 'vpn' ? 'direct' : 'vpn');
      const dot =
        document.getElementById(`dot-app-${idx}`) ||
        document.getElementById(`dot-source-${encodeURIComponent(appPath)}`);
      if (dot && scrollRect) {
        const dotRect = dot.getBoundingClientRect();
        const isVisible =
          dotRect.bottom >= scrollRect.top - 4 && dotRect.top <= scrollRect.bottom + 4;
        if (isVisible && dotRect.width > 0 && dotRect.height > 0) {
          endpoints.push({
            id: appPath,
            target,
            x1: dotRect.left + dotRect.width / 2 - canvasRect.left,
            y1: dotRect.top + dotRect.height / 2 - canvasRect.top,
          });
        }
      }
    });

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

    setWirePaths(newPaths);
  }, [systemGateway, appRoutes, settings.splitTunnelApps]);

  useEffect(() => {
    updateWires();
    const f1 = requestAnimationFrame(updateWires);
    const t1 = setTimeout(updateWires, 60);
    const t2 = setTimeout(updateWires, 180);
    const t3 = setTimeout(updateWires, 350);

    window.addEventListener('resize', updateWires);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
      ro = new ResizeObserver(() => {
        updateWires();
      });
      ro.observe(canvasRef.current);
      if (appsScrollRef.current) {
        ro.observe(appsScrollRef.current);
      }
    }

    return () => {
      cancelAnimationFrame(f1);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', updateWires);
      if (ro) ro.disconnect();
    };
  }, [updateWires, settings.splitTunnelApps]);

  const handleToggleSystem = () => {
    const next: 'vpn' | 'direct' = systemGateway === 'vpn' ? 'direct' : 'vpn';
    applyVisualRouting(next, appRoutes, settings.splitTunnelApps || []);
  };

  const handleToggleApp = (appPath: string) => {
    const current = appRoutes[appPath] || (systemGateway === 'vpn' ? 'direct' : 'vpn');
    const next: 'vpn' | 'direct' = current === 'vpn' ? 'direct' : 'vpn';
    const updated = { ...appRoutes, [appPath]: next };
    applyVisualRouting(systemGateway, updated, settings.splitTunnelApps || []);
  };

  const handleStartDrag = (
    sourceType: 'system' | 'app',
    sourceId: string,
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const startX = e.clientX - canvasRect.left;
    const startY = e.clientY - canvasRect.top;

    setSelectedSourceId(sourceId);
    setDragWire({
      active: true,
      sourceId,
      sourceType,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragWire || !dragWire.active || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    setDragWire((prev) =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - canvasRect.left,
            currentY: e.clientY - canvasRect.top,
          }
        : null
    );
  };

  const handleCanvasMouseUp = () => {
    if (dragWire) {
      setDragWire(null);
    }
  };

  const handleConnectToGateway = (target: 'vpn' | 'direct') => {
    if (!selectedSourceId) return;
    if (selectedSourceId === 'system') {
      applyVisualRouting(target, appRoutes, settings.splitTunnelApps || []);
    } else {
      const updated = { ...appRoutes, [selectedSourceId]: target };
      applyVisualRouting(systemGateway, updated, settings.splitTunnelApps || []);
    }
    setSelectedSourceId(null);
    setDragWire(null);
  };

  const handleRemoveApp = async (appToRemove: string) => {
    try {
      const currentApps = settings.splitTunnelApps || [];
      const updatedApps = currentApps.filter((a) => a !== appToRemove);
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

  return (
    <motion.div
      key="split"
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onAnimationComplete={() => updateWires()}
      className="flex-1 min-h-0 flex flex-col p-3.5 space-y-2 overflow-hidden"
    >
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
              disabled={mode !== 'tun'}
              onClick={onClearAllApps}
              className="text-[10px] text-zinc-400 hover:text-rose-400 transition cursor-pointer flex items-center space-x-1 disabled:opacity-30 disabled:pointer-events-none"
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
      {mode !== 'tun' && (
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
                Split tunneling routing is exclusively active in TUN mode.
              </p>
            </div>
          </div>
          {onSwitchToTun && (
            <button
              type="button"
              onClick={onSwitchToTun}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition active:scale-95 shadow-sm flex items-center space-x-1 shrink-0 cursor-pointer"
            >
              <Zap className="w-3 h-3 text-black fill-current" />
              <span>Switch to TUN</span>
            </button>
          )}
        </div>
      )}

      {/* Main interactive area: dimmed and disabled when not in TUN mode */}
      <div
        className={`flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden transition-all duration-200 relative ${
          mode !== 'tun' ? 'opacity-40 pointer-events-none select-none filter blur-[0.4px]' : ''
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
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white border border-white/10 text-[10px] font-medium transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
            <span className="whitespace-nowrap">+ Add .exe</span>
          </button>
          <button
            type="button"
            onClick={onOpenRunningApps}
            title="Pick from currently running applications"
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white border border-white/10 text-[10px] font-medium transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <Cpu className="w-3.5 h-3.5 text-zinc-300" />
            <span className="whitespace-nowrap">+ Running Apps</span>
          </button>
        </div>

        {/* Quick-Add Popular Presets Pills */}
        <div className="grid grid-cols-4 gap-1.5">
          {POPULAR_PRESETS.map((p) => {
            const Icon = p.icon;
            const isAdded = (settings.splitTunnelApps || []).some(
              (a) =>
                a.toLowerCase().includes(p.exe.toLowerCase()) ||
                a.toLowerCase().includes(p.name.toLowerCase())
            );
            return (
              <button
                key={p.id}
                type="button"
                disabled={isAdded}
                onClick={() => onAddPreset(p)}
                className={`py-1.5 px-1 rounded-lg border text-[9.5px] font-medium transition flex items-center justify-center space-x-1 ${
                  isAdded
                    ? 'bg-white/[0.02] border-white/5 text-zinc-600 cursor-default opacity-40'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-zinc-300 hover:text-white cursor-pointer active:scale-95'
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
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        className="canvas-dotted-grid rounded-2xl border border-white/10 flex-1 min-h-0 relative overflow-hidden flex select-none"
        style={{ touchAction: 'none' }}
      >
        {/* SVG Curved Bezier Connecting Wires Overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <defs>
            <clipPath id="canvas-clip">
              <rect x="0" y="0" width="100%" height="100%" rx="16" />
            </clipPath>
            <filter id="glow-white" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#ffffff" floodOpacity="0.6" />
            </filter>
            <filter id="glow-zinc" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#a1a1aa" floodOpacity="0.35" />
            </filter>
          </defs>

          <g clipPath="url(#canvas-clip)">
            {/* Animated bezier curves between source nodes and target gateways */}
            {wirePaths.map(({ id, target, pathD }) => {
              const isSelected = selectedSourceId === id;
              const isVpn = target === 'vpn';
              const strokeColor = isVpn ? '#ffffff' : '#a1a1aa';
              const glowFilter = isVpn ? 'url(#glow-white)' : 'url(#glow-zinc)';
              const bgStroke = isVpn ? 'rgba(255, 255, 255, 0.22)' : 'rgba(161, 161, 170, 0.12)';

              return (
                <g key={id}>
                  {/* Background thicker glow path */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={bgStroke}
                    strokeWidth={isSelected ? 5 : 3.5}
                    strokeLinecap="round"
                  />
                  {/* Foreground flowing animated dashed line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 2.4 : 1.8}
                    className="wire-animated"
                    filter={glowFilter}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Active Interactive Dragging Wire */}
            {dragWire &&
              dragWire.active &&
              (() => {
                const dx = Math.max(20, (dragWire.currentX - dragWire.startX) * 0.5);
                const dragD = `M ${dragWire.startX} ${dragWire.startY} C ${dragWire.startX + dx} ${dragWire.startY}, ${dragWire.currentX - dx} ${dragWire.currentY}, ${dragWire.currentX} ${dragWire.currentY}`;
                return (
                  <g>
                    <path
                      d={dragD}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.25)"
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                    <path
                      d={dragD}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}
          </g>
        </svg>

        {/* Left Column: Traffic Sources (Pinned My System + Configured App Nodes) */}
        <div className="w-[204px] h-full flex flex-col p-2 z-10 min-h-0">
          {/* Pinned "My System" Node */}
          <div
            onClick={handleToggleSystem}
            onMouseDown={(e) => handleStartDrag('system', 'system', e)}
            className={`h-[48px] mr-4 p-2 rounded-xl transition-all relative group cursor-pointer shrink-0 border flex items-center justify-between ${
              systemGateway === 'vpn'
                ? 'bg-white/[0.08] border-white/30 shadow-[0_0_12px_rgba(255,255,255,0.06)]'
                : 'bg-white/[0.03] border-white/10 hover:border-white/20'
            } ${selectedSourceId === 'system' ? 'ring-2 ring-white/60' : ''}`}
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
              id="dot-source-system"
              className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#0b0c10] transition shadow-md ${
                systemGateway === 'vpn' ? 'bg-white ring-2 ring-white/50' : 'bg-zinc-500 ring-2 ring-white/20'
              }`}
            />
          </div>

          {/* Section Divider */}
          <div className="flex items-center justify-between px-1 mr-4 py-1.5 shrink-0 text-zinc-500">
            <span className="text-[9px] font-semibold uppercase tracking-wider">Configured Apps</span>
            <span className="text-[9px] font-mono">{settings.splitTunnelApps?.length || 0}</span>
          </div>

          {/* Scrollable Configured App Nodes */}
          <div
            ref={appsScrollRef}
            onScroll={updateWires}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5"
          >
            {!settings.splitTunnelApps || settings.splitTunnelApps.length === 0 ? (
              <div className="h-full min-h-[140px] mr-4 flex flex-col items-center justify-center text-center p-3 rounded-xl bg-black/20 border border-white/5 space-y-1 text-zinc-500">
                <Layers className="w-5 h-5 text-zinc-600 mb-0.5" />
                <span className="text-[10px] font-medium text-zinc-400">No custom apps</span>
                <span className="text-[9px] text-zinc-500 leading-tight">
                  Use + Add .exe or quick presets above
                </span>
              </div>
            ) : (
              settings.splitTunnelApps.map((appPath, idx) => {
                const visual = getAppVisual(appPath);
                const baseName = appPath.split(/[\\/]/).pop() || appPath;
                const currentRoute = appRoutes[appPath] || (systemGateway === 'vpn' ? 'direct' : 'vpn');
                const isVpn = currentRoute === 'vpn';
                const isSelected = selectedSourceId === appPath;

                return (
                  <div
                    key={appPath}
                    onClick={() => handleToggleApp(appPath)}
                    onMouseDown={(e) => handleStartDrag('app', appPath, e)}
                    className={`h-[46px] mr-4 rounded-xl transition-all relative group cursor-pointer border flex items-center justify-between px-2 ${
                      isVpn
                        ? 'bg-white/[0.08] border-white/25 hover:border-white/40 text-white'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-zinc-300'
                    } ${isSelected ? 'ring-2 ring-white/60' : ''}`}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveApp(appPath);
                        }}
                        className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-rose-500/20 transition cursor-pointer"
                        title="Remove application rule"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* Right Connection Socket */}
                    <div
                      id={`dot-app-${idx}`}
                      data-app-path={appPath}
                      className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#0b0c10] transition shadow-md ${
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
            className="p-2 rounded-2xl border transition-all cursor-pointer relative bg-white/[0.07] hover:bg-white/[0.12] border-white/25 hover:border-white/45 shadow-[0_0_20px_rgba(255,255,255,0.08)] flex flex-col items-center text-center space-y-1 group active:scale-[0.98]"
            title="Click to route selected traffic to VPN Tunnel"
          >
            {/* Left Connection Dock Socket */}
            <div
              id="dot-gateway-vpn"
              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 rounded-full border-2 border-[#0b0c10] bg-white ring-2 ring-white/50 shadow-md group-hover:scale-110 transition"
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
            className="p-2 rounded-2xl border transition-all cursor-pointer relative bg-white/[0.03] hover:bg-white/[0.07] border-white/10 hover:border-white/25 shadow-sm flex flex-col items-center text-center space-y-1 group active:scale-[0.98]"
            title="Click to route selected traffic directly to Internet"
          >
            {/* Left Connection Dock Socket */}
            <div
              id="dot-gateway-direct"
              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 rounded-full border-2 border-[#0b0c10] bg-zinc-500 ring-2 ring-white/20 shadow-md group-hover:scale-110 transition"
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
    </motion.div>
  );
};
