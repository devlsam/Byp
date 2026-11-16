import React, { useState, useEffect, useRef } from 'react';
import { Events } from '@wailsio/runtime';
import { ArrowUp, ArrowDown } from '../../icons';
import { formatBytes, formatSpeed } from '../../utils/formatters';
import type { ZeltunStats } from '../../../bindings/changeme/internal/tun/models';
import type { TrafficStats } from '../../types';

interface LiveTrafficStatsProps {
  isActive?: boolean;
  mode?: string;
  connected?: boolean;
}

function areTrafficEqual(a: TrafficStats, b: TrafficStats): boolean {
  return (
    a.uploadSpeed === b.uploadSpeed &&
    a.downloadSpeed === b.downloadSpeed &&
    a.totalUpload === b.totalUpload &&
    a.totalDownload === b.totalDownload
  );
}

const ZERO_TRAFFIC: TrafficStats = {
  uploadSpeed: 0,
  downloadSpeed: 0,
  totalUpload: 0,
  totalDownload: 0,
};

/**
 * Isolated Live Traffic display component decoupled from the root application tree.
 * Subscribes to Xray traffic stats or Zeltun TUN stats (in Upstream mode) while visible.
 */
export const LiveTrafficStats: React.FC<LiveTrafficStatsProps> = React.memo(
  ({ isActive = true, mode = 'tun', connected = false }) => {
    const [traffic, setTraffic] = useState<TrafficStats>(ZERO_TRAFFIC);
    const prevTunRef = useRef<{ proxy: number; direct: number; ts: number } | null>(null);
    const isUpstream = mode === 'upstream';

    useEffect(() => {
      if (!connected) {
        prevTunRef.current = null;
        setTraffic(ZERO_TRAFFIC);
      }
    }, [connected, isUpstream]);

    useEffect(() => {
      if (!isActive) return;

      if (isUpstream) {
        const unbindTun = Events.On('tun:stats', (event: any) => {
          if (!event?.data) return;
          const st = event.data as ZeltunStats;
          const now = Date.now();
          let proxySpeed = 0;
          let directSpeed = 0;

          if (prevTunRef.current) {
            const elapsedSec = Math.max(0.2, (now - prevTunRef.current.ts) / 1000);
            if (st.proxyBytes >= prevTunRef.current.proxy) {
              proxySpeed = Math.round((st.proxyBytes - prevTunRef.current.proxy) / elapsedSec);
            }
            if (st.directBytes >= prevTunRef.current.direct) {
              directSpeed = Math.round((st.directBytes - prevTunRef.current.direct) / elapsedSec);
            }
          }
          prevTunRef.current = { proxy: st.proxyBytes, direct: st.directBytes, ts: now };

          const next: TrafficStats = {
            downloadSpeed: proxySpeed,
            uploadSpeed: directSpeed,
            totalDownload: st.proxyBytes,
            totalUpload: st.directBytes,
          };
          setTraffic((prev) => (areTrafficEqual(prev, next) ? prev : next));
        });
        return () => {
          unbindTun();
        };
      }

      const unbind = Events.On('traffic:update', (event: any) => {
        if (event && event.data) {
          const next = event.data as TrafficStats;
          setTraffic((prev) => (areTrafficEqual(prev, next) ? prev : next));
        }
      });
      return () => {
        unbind();
      };
    }, [isActive, isUpstream]);

    const firstLabel = isUpstream ? 'Proxied (TUN)' : 'Download';
    const secondLabel = isUpstream ? 'Direct Bypass' : 'Upload';

    return (
      <div className="space-y-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block px-1">
          {isUpstream ? 'TUN Split Throughput' : 'Data Usage & Speed'}
        </span>

        <div className="grid grid-cols-2 gap-3">
          {/* Primary Counter */}
          <div className="modern-surface rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] uppercase font-semibold tracking-wider">{firstLabel}</span>
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

          {/* Secondary Counter */}
          <div className="modern-surface rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] uppercase font-semibold tracking-wider">{secondLabel}</span>
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
  }
);

LiveTrafficStats.displayName = 'LiveTrafficStats';
