import React, { useCallback } from 'react';
import type { Settings } from '../../../../bindings/changeme/internal/storage/models';
import {
  GAMING_QOS_ITEM,
  MTU_PRESETS,
  RING_PRESETS,
  UDP_TIMEOUT_PRESETS,
  getMtuTag,
  type BooleanSettingKey,
} from './tunConfig';
import {
  PrecisionTrackControl,
  SegmentedControl,
  TunToggleRow,
  type SegmentedOption,
} from './TunPrimitives';

interface TunTuningSectionProps {
  settings: Settings;
  currentMtu: number;
  currentRingMb: number;
  currentUdpTimeout: number;
  connected: boolean;
  mode: string;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<unknown> | void;
  onToggleKey: (key: BooleanSettingKey) => void;
}

const RING_OPTIONS: SegmentedOption<number>[] = RING_PRESETS.map((mb) => ({
  value: mb,
  label: `${mb}MB`,
}));

const UDP_OPTIONS: SegmentedOption<number>[] = UDP_TIMEOUT_PRESETS.map((sec) => ({
  value: sec,
  label: `${sec}s`,
}));

/**
 * Clean performance tuning view: calibrated MTU slider + presets,
 * compact inline WinTUN Ring Buffer, gliding UDP timeout bar, and QoS switch.
 */
export const TunTuningSection: React.FC<TunTuningSectionProps> = React.memo(
  ({
    settings,
    currentMtu,
    currentRingMb,
    currentUdpTimeout,
    connected,
    mode,
    onUpdateSettings,
    onToggleKey,
  }) => {
    const mtuTag = getMtuTag(currentMtu);

    const handleCommitMtu = useCallback(
      (nextMtu: number) => onUpdateSettings({ tunMtu: nextMtu }),
      [onUpdateSettings]
    );

    return (
      <div className="space-y-2">
        <PrecisionTrackControl
          label="Adapter MTU"
          ariaLabel="Adapter MTU"
          value={currentMtu}
          min={576}
          max={9000}
          presets={MTU_PRESETS}
          headerRight={
            <span className="text-[9px] font-mono text-zinc-400">
              {mtuTag}
              {connected && (mode === 'tun' || mode === 'upstream') ? ' · Hot-reload' : ''}
            </span>
          }
          onCommit={handleCommitMtu}
        />

        {/* Unified Buffer & UDP Session Panel */}
        <div className="rounded-xl bg-[#121317] border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white">WinTUN Ring Buffer</div>
              <div className="text-[9.5px] text-zinc-400">Queue capacity</div>
            </div>
            <div className="w-[144px] shrink-0">
              <SegmentedControl
                ariaLabel="WinTUN Ring Buffer"
                options={RING_OPTIONS}
                value={RING_PRESETS.includes(currentRingMb) ? currentRingMb : null}
                onChange={(mb) => onUpdateSettings({ zeltunRingMb: mb })}
                compact
              />
            </div>
          </div>

          <div className="px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white">UDP Session Timeout</span>
              <span className="text-[9.5px] text-zinc-400">Idle NAT reclaim</span>
            </div>
            <SegmentedControl
              ariaLabel="UDP Session Timeout"
              options={UDP_OPTIONS}
              value={UDP_TIMEOUT_PRESETS.includes(currentUdpTimeout) ? currentUdpTimeout : null}
              onChange={(sec) => onUpdateSettings({ zeltunUdpTimeoutSec: sec })}
              compact
            />
          </div>
        </div>

        <TunToggleRow
          item={GAMING_QOS_ITEM}
          enabled={Boolean(settings.zeltunGamingQos)}
          onToggleKey={onToggleKey}
        />
      </div>
    );
  }
);
TunTuningSection.displayName = 'TunTuningSection';
