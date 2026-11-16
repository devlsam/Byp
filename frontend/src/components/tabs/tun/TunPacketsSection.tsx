import React, { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Settings } from '../../../../bindings/changeme/internal/storage/models';
import { MSS_PRESETS, PACKET_TOGGLES, type BooleanSettingKey } from './tunConfig';
import { PrecisionTrackControl, TunToggleRow } from './TunPrimitives';

interface TunPacketsSectionProps {
  settings: Settings;
  currentMtu: number;
  currentMss: number;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<unknown> | void;
  onToggleKey: (key: BooleanSettingKey) => void;
}

const MSS_PRESET_ITEMS = MSS_PRESETS.map((v) => ({ value: v, label: String(v) }));

/**
 * Packet & protocol rules section featuring an inline expandable
 * TCP MSS Clamp drawer with one-click MTU-40 alignment.
 */
export const TunPacketsSection: React.FC<TunPacketsSectionProps> = React.memo(
  ({ settings, currentMtu, currentMss, onUpdateSettings, onToggleKey }) => {
    const recommendedMss = Math.min(1460, Math.max(536, currentMtu - 40));
    const isMatchedToMtu = currentMss === recommendedMss;

    const handleCommitMss = useCallback(
      (nextMss: number) => onUpdateSettings({ zeltunTcpMss: nextMss }),
      [onUpdateSettings]
    );

    return (
      <div className="rounded-xl bg-[#121317] border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
        {PACKET_TOGGLES.map((item) => {
          const enabled = Boolean(settings[item.key]);
          const isMssDrawerOpen = item.key === 'zeltunMssClamp' && enabled;

          return (
            <div key={item.key}>
              <TunToggleRow
                item={item}
                enabled={enabled}
                onToggleKey={onToggleKey}
                variant="divided"
              />

              <AnimatePresence initial={false}>
                {isMssDrawerOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="p-2.5 bg-[#0b0c10] border-t border-white/[0.08]">
                      <PrecisionTrackControl
                        embedded
                        label="TCP MSS Clamp Limit"
                        ariaLabel="TCP MSS Clamp Limit"
                        value={currentMss}
                        min={536}
                        max={1460}
                        presets={MSS_PRESET_ITEMS}
                        headerRight={
                          <button
                            type="button"
                            onClick={() => handleCommitMss(recommendedMss)}
                            disabled={isMatchedToMtu}
                            title={`Match MTU - 40 (${recommendedMss} bytes)`}
                            className={`text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded border transition-colors duration-150 ${
                              isMatchedToMtu
                                ? 'bg-white/10 text-zinc-400 border-white/10 cursor-default'
                                : 'bg-white text-black border-white hover:bg-zinc-200 cursor-pointer font-semibold'
                            }`}
                          >
                            {isMatchedToMtu ? `MTU-40 (${recommendedMss})` : `Sync ${recommendedMss}`}
                          </button>
                        }
                        onCommit={handleCommitMss}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }
);
TunPacketsSection.displayName = 'TunPacketsSection';
