import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Settings } from '../../../bindings/changeme/internal/storage/models';
import { Cpu, Info, RefreshCw } from '../../icons';
import { toast } from '../../Toaster';
import {
  BALANCED_DEFAULT_SETTINGS,
  MTU_PRESETS,
  TUN_PRESET_PROFILES,
  type BooleanSettingKey,
  type TunEngine,
  type TunPresetProfile,
  type TunSection,
} from './tun/tunConfig';
import {
  handleRovingGroupKeyDown,
  PrecisionTrackControl,
  SegmentedControl,
  type SegmentedOption,
} from './tun/TunPrimitives';
import { TunAdapterHeaderCard } from './tun/TunAdapterHeaderCard';
import { TunTuningSection } from './tun/TunTuningSection';
import { TunShieldSection } from './tun/TunShieldSection';
import { TunPacketsSection } from './tun/TunPacketsSection';

interface TunSettingsTabProps {
  settings: Settings;
  connected: boolean;
  mode: string;
  isActive?: boolean;
  onSwitchToTun: () => void;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<unknown> | void;
}

const SECTION_TABS: ReadonlyArray<{ id: TunSection; label: string }> = [
  { id: 'perf', label: 'Perf & MTU' },
  { id: 'shield', label: 'Leak Shield' },
  { id: 'packets', label: 'Packets' },
];

const PRESET_OPTIONS: SegmentedOption<TunPresetProfile['id']>[] = TUN_PRESET_PROFILES.map(
  (p) => ({ value: p.id, label: p.label })
);

/**
 * Fixed-frame minimal TUN Settings tab with cohesive profile presets,
 * unified option workspace, and dedicated internal scrolling.
 */
export const TunSettingsTab: React.FC<TunSettingsTabProps> = React.memo(
  ({ settings, connected, mode, isActive = true, onSwitchToTun, onUpdateSettings }) => {
    const activeEngine: TunEngine = settings.tunEngine === 'tun2socks' ? 'tun2socks' : 'zeltun';
    const currentMtu = settings.tunMtu || (activeEngine === 'tun2socks' ? 9000 : 1500);
    const currentMss = settings.zeltunTcpMss || 1360;
    const currentUdpTimeout = settings.zeltunUdpTimeoutSec || 120;
    const currentRingMb = settings.zeltunRingMb || 4;

    const [activeSection, setActiveSection] = useState<TunSection>('perf');
    const panelScrollRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    useEffect(() => {
      if (panelScrollRef.current) {
        panelScrollRef.current.scrollTop = 0;
      }
    }, [activeSection]);

    const activePresetId = useMemo(() => {
      for (const profile of TUN_PRESET_PROFILES) {
        const matches = Object.entries(profile.patch).every(([key, val]) => {
          return (settings as unknown as Record<string, unknown>)[key] === val;
        });
        if (matches) return profile.id;
      }
      return null;
    }, [settings]);

    const isBalancedDefault = useMemo(() => {
      return Object.entries(BALANCED_DEFAULT_SETTINGS).every(([key, val]) => {
        if (key === 'tunConfigVersion') return true;
        return (settings as unknown as Record<string, unknown>)[key] === val;
      });
    }, [settings]);

    const handleEngineSwitch = useCallback(
      (engine: TunEngine) => {
        if (engine === activeEngine) return;
        onUpdateSettings({ tunEngine: engine });
        toast.info(
          `TUN Engine: ${engine === 'zeltun' ? 'Zeltun' : 'tun2socks'}`,
          connected && (mode === 'tun' || mode === 'upstream')
            ? 'Reloading virtual network adapter seamlessly...'
            : 'Saved for next TUN connection.'
        );
      },
      [activeEngine, connected, mode, onUpdateSettings]
    );

    const handleApplyPresetId = useCallback(
      (id: TunPresetProfile['id']) => {
        const profile = TUN_PRESET_PROFILES.find((p) => p.id === id);
        if (!profile) return;
        onUpdateSettings(profile.patch);
        toast.success(`${profile.label} Profile Applied`, 'TUN parameters updated.');
      },
      [onUpdateSettings]
    );

    const handleResetTunDefaults = useCallback(() => {
      onUpdateSettings(BALANCED_DEFAULT_SETTINGS);
      toast.info(
        'TUN Defaults Restored',
        'All virtual adapter settings reset to Balanced defaults.'
      );
    }, [onUpdateSettings]);

    const handleToggleKey = useCallback(
      (key: BooleanSettingKey) => {
        const nextVal = !Boolean(settingsRef.current[key]);
        onUpdateSettings({ [key]: nextVal } as Partial<Settings>);
      },
      [onUpdateSettings]
    );

    const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      handleRovingGroupKeyDown({
        e,
        index: idx,
        count: SECTION_TABS.length,
        role: 'tab',
        onSelectIndex: (nextIdx) => setActiveSection(SECTION_TABS[nextIdx].id),
      });
    }, []);

    const activeSectionIdx = SECTION_TABS.findIndex((t) => t.id === activeSection);

    return (
      <div className="flex-1 min-h-0 flex flex-col px-3.5 py-2.5 space-y-2 overflow-hidden">
        {/* Clean Fixed Header */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-4 h-4 text-zinc-200 shrink-0" />
            <span>TUN Settings</span>
          </h2>

          <button
            type="button"
            onClick={handleResetTunDefaults}
            title="Restore balanced TUN defaults"
            className="px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] font-medium text-zinc-300 hover:text-white flex items-center gap-1.5 shrink-0 cursor-pointer will-change-transform transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            {!isBalancedDefault && (
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.85)]"
              />
            )}
            <RefreshCw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Minimal Virtual Adapter Header & Core Switcher */}
        <TunAdapterHeaderCard
          activeEngine={activeEngine}
          connected={connected}
          mode={mode}
          currentMtu={currentMtu}
          isActive={isActive}
          onSwitchToTun={onSwitchToTun}
          onSwitchEngine={handleEngineSwitch}
        />

        {/* Clean Simple Profile Pill Strip (Zeltun) */}
        {activeEngine === 'zeltun' && (
          <div className="space-y-1 shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Profile
              </span>
              <span className="text-[9.5px] font-mono text-zinc-400">
                {activePresetId === null ? 'Custom' : 'Preset'}
              </span>
            </div>
            <SegmentedControl
              ariaLabel="Zeltun Optimization Profile"
              options={PRESET_OPTIONS}
              value={activePresetId}
              onChange={handleApplyPresetId}
            />
          </div>
        )}

        {/* Content-Hugging Options Deck clamped strictly to remaining window height */}
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 flex flex-col">
            {activeEngine === 'zeltun' ? (
              <div className="modern-surface rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-full">
                {/* Pure Glowing Underline Tab Bar */}
                <div
                  role="tablist"
                  aria-label="TUN configuration sections"
                  className="relative grid grid-cols-3 border-b border-white/[0.08] bg-[#0d0e12] shrink-0"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-0 w-1/3 h-[2px] flex justify-center will-change-transform transition-transform duration-200"
                    style={{
                      transitionTimingFunction: 'cubic-bezier(0.22, 1.25, 0.36, 1)',
                      transform: `translate3d(${activeSectionIdx * 100}%, 0, 0)`,
                    }}
                  >
                    <span className="w-2/3 h-full rounded-t-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]" />
                  </div>

                  {SECTION_TABS.map((tab, idx) => {
                    const isSelected = activeSection === tab.id;
                    return (
                      <button
                        key={tab.id}
                        id={`tun-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-controls={`tun-panel-${tab.id}`}
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => setActiveSection(tab.id)}
                        onKeyDown={(e) => handleTabKeyDown(e, idx)}
                        className={`relative z-10 py-2 px-1.5 flex items-center justify-center text-[10.5px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/40 transition-colors duration-150 ${
                          isSelected ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Hugs content when shorter; scrolls cleanly inside card when capped at max-h-full */}
                <div
                  ref={panelScrollRef}
                  id={`tun-panel-${activeSection}`}
                  role="tabpanel"
                  aria-labelledby={`tun-tab-${activeSection}`}
                  className="min-h-0 overflow-y-auto no-scrollbar"
                >
                  <div className="p-2.5">
                    {activeSection === 'perf' && (
                      <TunTuningSection
                        settings={settings}
                        currentMtu={currentMtu}
                        currentRingMb={currentRingMb}
                        currentUdpTimeout={currentUdpTimeout}
                        connected={connected}
                        mode={mode}
                        onUpdateSettings={onUpdateSettings}
                        onToggleKey={handleToggleKey}
                      />
                    )}

                    {activeSection === 'shield' && (
                      <TunShieldSection settings={settings} onToggleKey={handleToggleKey} />
                    )}

                    {activeSection === 'packets' && (
                      <TunPacketsSection
                        settings={settings}
                        currentMtu={currentMtu}
                        currentMss={currentMss}
                        onUpdateSettings={onUpdateSettings}
                        onToggleKey={handleToggleKey}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="modern-surface rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-full">
                <div className="min-h-0 overflow-y-auto no-scrollbar">
                  <div className="p-3 space-y-2.5">
                    <PrecisionTrackControl
                      label="Adapter MTU"
                      ariaLabel="Adapter MTU"
                      value={currentMtu}
                      min={576}
                      max={9000}
                      presets={MTU_PRESETS}
                      headerRight={
                        <span className="text-[9px] text-zinc-400">
                          9000 recommended for gVisor
                        </span>
                      }
                      onCommit={(nextMtu) => onUpdateSettings({ tunMtu: nextMtu })}
                    />

                    <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                      <div className="flex items-start gap-2 min-w-0">
                        <Info className="w-3.5 h-3.5 text-zinc-300 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                          Switch to <strong className="text-white">Zeltun</strong> to unlock QUIC
                          blocking, NRPT leak guard, UDP QoS, and live telemetry.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEngineSwitch('zeltun')}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-[10px] font-semibold shrink-0 cursor-pointer will-change-transform transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
                      >
                        Use Zeltun
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Beginner Guidance Footer */}
        <div className="shrink-0 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.025] border border-white/[0.06] text-[10px] text-zinc-400 leading-snug text-center">
          <Info className="w-3 h-3 text-zinc-400 shrink-0" />
          <p>
            No technical or coding background? Use{' '}
            <span className="text-zinc-200 font-medium">default settings</span>.
          </p>
        </div>
      </div>
    );
  }
);

TunSettingsTab.displayName = 'TunSettingsTab';
