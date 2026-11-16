import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Settings } from '../../../../bindings/changeme/internal/storage/models';
import { AlertCircle } from '../../../icons';
import { SHIELD_TOGGLES, type BooleanSettingKey } from './tunConfig';
import { TunToggleRow } from './TunPrimitives';

interface TunShieldSectionProps {
  settings: Settings;
  onToggleKey: (key: BooleanSettingKey) => void;
}

/**
 * Clean Leak Shield section featuring a unified hairline-divided switch list
 * and smooth notice drawer when Strict Split Anti-Leak is enabled.
 */
export const TunShieldSection: React.FC<TunShieldSectionProps> = React.memo(
  ({ settings, onToggleKey }) => (
    <div className="space-y-2">
      {/* Unified Hairline-Divided Guard Surface */}
      <div className="rounded-xl bg-[#121317] border border-white/[0.06] divide-y divide-white/[0.06] overflow-hidden">
        {SHIELD_TOGGLES.map((item) => (
          <TunToggleRow
            key={item.key}
            item={item}
            enabled={Boolean(settings[item.key])}
            onToggleKey={onToggleKey}
            variant="divided"
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {settings.zeltunStrictLeak && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.05] border border-white/20 text-[10px] text-zinc-200 leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 text-white shrink-0 mt-0.5" />
              <span>
                Strict Split Anti-Leak is active: tunnel DNS queries will never fall back to your
                direct ISP connection if upstream stalls.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
);
TunShieldSection.displayName = 'TunShieldSection';
