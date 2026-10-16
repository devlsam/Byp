import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

/**
 * Left sidebar dock rail navigation, featuring smooth spring layout transitions
 * and GitHub profile redirection.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  selectedTab,
  setSelectedTab,
  connected,
}) => {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);

  const handleOpenGithub = () => {
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
  };

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
            <AppLogo className="w-8 h-8 text-white transition-all duration-300 drop-shadow-[0_0_12px_rgba(255,255,255,0.85)] hover:drop-shadow-[0_0_16px_rgba(255,255,255,1)] hover:scale-105" />
            {connected && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,1)]" />
            )}
          </div>
        </div>

        {/* Dock Navigation: 5 Tabs directly on unified canvas */}
        <div className="flex flex-col items-center space-y-1.5 relative w-[48px]">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = selectedTab === tab.id;

            return (
              <div key={tab.id} className="relative w-full flex items-center justify-center">
                <motion.button
                  onClick={() => setSelectedTab(tab.id as AppTab)}
                  onMouseEnter={() => {
                    setHoveredTab(tab.id);
                    setHoveredTooltip(tab.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredTab(null);
                    setHoveredTooltip(null);
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                  className={`relative z-10 w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150 ${
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {/* Active Sliding Spring Pill */}
                  {isActive && (
                    <motion.div
                      layoutId="activeDockPill"
                      transition={{
                        type: 'spring',
                        stiffness: 480,
                        damping: 34,
                        mass: 0.6,
                      }}
                      className="absolute inset-0 rounded-xl bg-white/20 border border-white/40 shadow-[0_2px_14px_rgba(255,255,255,0.22)] backdrop-blur-md -z-10"
                    />
                  )}

                  {/* Gliding Hover Highlight for Inactive Tabs */}
                  {!isActive && hoveredTab === tab.id && (
                    <motion.div
                      layoutId="hoverDockGlow"
                      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                      className="absolute inset-0 rounded-xl bg-white/[0.08] border border-white/10 -z-10"
                    />
                  )}

                  {/* Fixed Icon */}
                  <div className="w-4 h-4 flex items-center justify-center pointer-events-none">
                    <Icon
                      className={`w-4 h-4 transition-all duration-150 ${
                        isActive ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]' : ''
                      }`}
                    />
                  </div>
                </motion.button>

                {/* Tooltip on Hover */}
                <AnimatePresence>
                  {hoveredTooltip === tab.id && (
                    <motion.div
                      initial={{ opacity: 0, x: -8, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -8, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                      className="absolute left-[56px] z-50 pointer-events-none flex items-center space-x-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-[#181920]/95 border border-white/15 text-[10px] font-medium text-white shadow-2xl backdrop-blur-md"
                    >
                      <span>{tab.label}</span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 text-zinc-300 font-semibold">
                        {tab.shortcut}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar Bottom: GitHub Profile Link */}
      <div className="flex flex-col items-center w-full mb-1">
        <div className="relative flex items-center justify-center">
          <motion.button
            onClick={handleOpenGithub}
            onMouseEnter={() => setHoveredTooltip('github')}
            onMouseLeave={() => setHoveredTooltip(null)}
            whileHover={{ scale: 1.15, y: -1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] hover:border hover:border-white/15 border border-transparent transition-all duration-200"
            title="GitHub Profile"
          >
            <Github className="w-4 h-4" />
          </motion.button>

          <AnimatePresence>
            {hoveredTooltip === 'github' && (
              <motion.div
                initial={{ opacity: 0, x: -10, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                className="absolute left-[56px] z-50 pointer-events-none whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-[#181920]/95 border border-white/15 text-[10px] font-medium text-white shadow-2xl backdrop-blur-md flex items-center space-x-1.5"
              >
                <span>GitHub</span>
                <span className="text-[9px] font-mono text-zinc-400">@devlsam</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
};
