import React, { useCallback, useMemo, useRef } from 'react';
import { Browser } from '@wailsio/runtime';
import { AppLogo, Github } from '../../icons';
import { NAV_TABS } from '../../constants/presets';
import type { AppTab } from '../../types';

interface SidebarProps {
  selectedTab: AppTab;
  setSelectedTab: (tab: AppTab) => void;
  connected: boolean;
  mode?: string;
  onResetNetwork?: () => void;
  onModeChange?: (mode: string) => void;
}

const TAB_STEP_PX = 42; // h-9 (36px) + space-y-1.5 (6px)

/**
 * Left sidebar dock rail navigation, featuring GPU-composited spring pills
 * and tooltips with zero React re-renders or main-thread repaints on hover.
 */
export const Sidebar: React.FC<SidebarProps> = React.memo(({
  selectedTab,
  setSelectedTab,
  connected,
}) => {
  const hoverPillRef = useRef<HTMLDivElement>(null);
  const tooltipPosRef = useRef<HTMLDivElement>(null);
  const tooltipBoxRef = useRef<HTMLDivElement>(null);
  const tooltipLabelRef = useRef<HTMLSpanElement>(null);
  const tooltipKeyRef = useRef<HTMLSpanElement>(null);

  const activeIndex = useMemo(() => {
    const idx = NAV_TABS.findIndex((t) => t.id === selectedTab);
    return idx >= 0 ? idx : 0;
  }, [selectedTab]);

  const handleDockLeave = useCallback(() => {
    if (hoverPillRef.current) {
      hoverPillRef.current.style.opacity = '0';
    }
    if (tooltipBoxRef.current) {
      tooltipBoxRef.current.style.opacity = '0';
      tooltipBoxRef.current.style.transform = 'translate3d(-6px, 0, 0) scale(0.95)';
    }
  }, []);

  const handleTabHover = useCallback((idx: number) => {
    const pill = hoverPillRef.current;
    if (pill) {
      if (idx === activeIndex) {
        pill.style.opacity = '0';
      } else {
        pill.style.transform = `translate3d(0, ${idx * TAB_STEP_PX}px, 0)`;
        pill.style.opacity = '1';
      }
    }

    const tab = NAV_TABS[idx];
    if (tab && tooltipPosRef.current && tooltipBoxRef.current) {
      if (tooltipLabelRef.current) tooltipLabelRef.current.textContent = tab.label;
      if (tooltipKeyRef.current) tooltipKeyRef.current.textContent = tab.shortcut;
      tooltipPosRef.current.style.transform = `translate3d(0, ${idx * TAB_STEP_PX}px, 0)`;
      tooltipBoxRef.current.style.opacity = '1';
      tooltipBoxRef.current.style.transform = 'translate3d(0, 0, 0) scale(1)';
    }
  }, [activeIndex]);

  const handleTabSelect = useCallback((tabId: AppTab) => {
    if (hoverPillRef.current) {
      hoverPillRef.current.style.opacity = '0';
    }
    setSelectedTab(tabId);
  }, [setSelectedTab]);

  const handleOpenGithub = useCallback(() => {
    const url = 'https://github.com/devlsam';
    try {
      Browser.OpenURL(url);
    } catch (_) {
      try {
        window.open(url, '_blank');
      } catch (e) {
        console.error('Failed to open GitHub profile URL:', e);
      }
    }
  }, []);

  return (
    <aside className="w-[66px] h-full shrink-0 bg-[#08080A] flex flex-col items-center py-2.5 justify-between z-30 select-none relative group/sidebar">
      <div className="flex flex-col items-center space-y-4 w-full">
        {/* Top Brand Logo - Seamless with sidebar */}
        <div
          onMouseDown={(e) => {
            if (e.button === 0) {
              try {
                if ((window as any).chrome?.webview?.postMessage) {
                  (window as any).chrome.webview.postMessage('wails:drag');
                }
              } catch (_) {}
            }
          }}
          style={{
            ['--wails-draggable' as any]: 'drag',
            ['-webkit-app-region' as any]: 'drag',
          } as React.CSSProperties}
          className="h-10 w-full flex items-center justify-center shrink-0 wails-drag cursor-default"
        >
          <div className="relative flex items-center justify-center">
            <AppLogo className="w-8 h-8 text-white will-change-transform transition-transform duration-200 drop-shadow-[0_0_12px_rgba(255,255,255,0.85)] hover:scale-105" />
            {connected && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,1)]" />
            )}
          </div>
        </div>

        {/* Dock Navigation: 6 Tabs directly on unified canvas */}
        <div
          onMouseLeave={handleDockLeave}
          className="flex flex-col items-center gap-1.5 relative w-[48px]"
        >
          {/* Single GPU-gliding hover glow pill (zero React re-renders) */}
          <div
            ref={hoverPillRef}
            aria-hidden="true"
            className="sidebar-hover-pill pointer-events-none absolute top-0 left-1.5 w-9 h-9 rounded-xl bg-white/[0.08] border border-white/10 opacity-0"
            style={{ transform: `translate3d(0, ${activeIndex * TAB_STEP_PX}px, 0)` }}
          />

          {/* Single GPU-gliding spring active pill */}
          <div
            aria-hidden="true"
            className="sidebar-spring-pill pointer-events-none absolute top-0 left-1.5 w-9 h-9 rounded-xl bg-white/20 border border-white/40 shadow-[0_2px_14px_rgba(255,255,255,0.22)]"
            style={{ transform: `translate3d(0, ${activeIndex * TAB_STEP_PX}px, 0)` }}
          />

          {NAV_TABS.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = idx === activeIndex;

            return (
              <div
                key={tab.id}
                onMouseEnter={() => handleTabHover(idx)}
                className="relative w-full flex items-center justify-center"
              >
                <button
                  type="button"
                  onClick={() => handleTabSelect(tab.id as AppTab)}
                  className={`relative z-10 w-9 h-9 rounded-xl flex items-center justify-center will-change-transform transition-transform duration-150 hover:scale-105 active:scale-95 ${
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {/* Fixed Icon */}
                  <div className="w-4 h-4 flex items-center justify-center pointer-events-none">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]' : ''
                      }`}
                    />
                  </div>
                </button>
              </div>
            );
          })}

          {/* Single Shared GPU Tooltip (zero per-row hover CSS recalc & zero React re-renders) */}
          <div
            ref={tooltipPosRef}
            aria-hidden="true"
            className="sidebar-hover-pill pointer-events-none absolute top-0 left-[56px] h-9 z-50 flex items-center"
            style={{ transform: `translate3d(0, ${activeIndex * TAB_STEP_PX}px, 0)` }}
          >
            <div
              ref={tooltipBoxRef}
              className="sidebar-tooltip flex items-center space-x-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-[#181920] border border-white/15 text-[10px] font-medium text-white shadow-[0_10px_28px_rgba(0,0,0,0.65)] opacity-0"
              style={{ transform: 'translate3d(-6px, 0, 0) scale(0.95)' }}
            >
              <span ref={tooltipLabelRef} />
              <span
                ref={tooltipKeyRef}
                className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-semibold"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Bottom: GitHub Profile Link */}
      <div className="flex flex-col items-center w-full mb-1">
        <div className="relative flex items-center justify-center group/gh">
          <button
            type="button"
            onClick={handleOpenGithub}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] hover:border-white/15 border border-transparent will-change-transform transition-transform duration-150 hover:scale-110 active:scale-90"
            title="GitHub Profile"
          >
            <Github className="w-4 h-4" />
          </button>

          <div className="sidebar-tooltip absolute left-[56px] z-50 pointer-events-none whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-[#181920] border border-white/15 text-[10px] font-medium text-white shadow-[0_10px_28px_rgba(0,0,0,0.65)] flex items-center space-x-1.5 opacity-0 -translate-x-2 scale-95 group-hover/gh:opacity-100 group-hover/gh:translate-x-0 group-hover/gh:scale-100">
            <span>GitHub</span>
            <span className="text-[9px] font-mono text-zinc-400">@devlsam</span>
          </div>
        </div>
      </div>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';
