import React, { useState, useEffect } from 'react';
import { Events } from '@wailsio/runtime';
import { ArrowUp, ArrowDown } from '../../icons';
import { formatBytes, formatSpeed } from '../../utils/formatters';
import type { TrafficStats } from '../../types';

/**
 * Isolated Live Traffic display component decoupled from the root application tree.
 * Prevents frequent interval-based re-renders of unrelated tabs and canvas elements.
 */
export const LiveTrafficStats = React.memo(() => {
  const [traffic, setTraffic] = useState<TrafficStats>({
    uploadSpeed: 0,
    downloadSpeed: 0,
    totalUpload: 0,
    totalDownload: 0,
  });

  useEffect(() => {
    const unbind = Events.On('traffic:update', (event: any) => {
      if (event && event.data) {
        setTraffic(event.data);
      }
    });
    return () => {
      unbind();
    };
  }, []);

  return (
    <div className="space-y-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block px-1">
        Data Usage & Speed
      </span>

      <div className="grid grid-cols-2 gap-3">
        {/* Download */}
        <div className="modern-surface rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] uppercase font-semibold tracking-wider">Download</span>
            <ArrowDown className="w-3.5 h-3.5 text-zinc-300" />
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white tracking-tight">
              {formatBytes(traffic.totalDownload)}
            </div>
            <div className="text-[11px] font-mono text-zinc-300 font-medium mt-0.5">
              {formatSpeed(traffic.downloadSpeed)}
            </div>
          </div>
        </div>

        {/* Upload */}
        <div className="modern-surface rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] uppercase font-semibold tracking-wider">Upload</span>
            <ArrowUp className="w-3.5 h-3.5 text-zinc-300" />
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white tracking-tight">
              {formatBytes(traffic.totalUpload)}
            </div>
            <div className="text-[11px] font-mono text-zinc-400 font-medium mt-0.5">
              {formatSpeed(traffic.uploadSpeed)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

LiveTrafficStats.displayName = 'LiveTrafficStats';
