import type { Settings } from '../../../../bindings/changeme/internal/storage/models';
import type { ZeltunStats } from '../../../../bindings/changeme/internal/tun/models';

export type TunSection = 'perf' | 'shield' | 'packets';

export type TunEngine = 'zeltun' | 'tun2socks';

export type BooleanSettingKey =
  | 'zeltunBlockQuic'
  | 'zeltunGamingQos'
  | 'zeltunCleanDns'
  | 'zeltunStrictLeak'
  | 'zeltunEnableNrpt'
  | 'zeltunBlockIpv6'
  | 'zeltunMssClamp'
  | 'zeltunSniSniff'
  | 'zeltunBypassLan';

export interface EngineCoreSpec {
  id: TunEngine;
  name: string;
  runtime: string;
  tagline: string;
  desc: string;
  recommended?: boolean;
}

export const TUN_ENGINE_CORES: EngineCoreSpec[] = [
  {
    id: 'zeltun',
    name: 'Zeltun',
    runtime: 'Rust',
    tagline: 'Native WinTUN',
    desc: 'Low-overhead WinTUN engine with leak guard & UDP QoS.',
    recommended: true,
  },
  {
    id: 'tun2socks',
    name: 'tun2socks',
    runtime: 'Go',
    tagline: 'gVisor Stack',
    desc: 'Classic Go gVisor TCP/IP stack supporting Jumbo MTU.',
  },
];

export interface TunToggleItem {
  key: BooleanSettingKey;
  title: string;
  desc: string;
}

export const SHIELD_TOGGLES: TunToggleItem[] = [
  {
    key: 'zeltunCleanDns',
    title: 'Tunnel DNS Intercept',
    desc: 'Routes UDP:53 DNS queries cleanly inside WinTUN.',
  },
  {
    key: 'zeltunEnableNrpt',
    title: 'Windows NRPT Guard',
    desc: 'Enforces NRPT policy to block smart DNS leaks.',
  },
  {
    key: 'zeltunBlockIpv6',
    title: 'IPv6 Blackhole Guard',
    desc: 'Blocks ::/1 routes to prevent dual-stack leaks.',
  },
  {
    key: 'zeltunStrictLeak',
    title: 'Strict Split Anti-Leak',
    desc: 'Never falls back to ISP if tunnel DNS stalls.',
  },
];

export const PACKET_TOGGLES: TunToggleItem[] = [
  {
    key: 'zeltunBlockQuic',
    title: 'Block QUIC (UDP:443)',
    desc: 'Forces HTTP/3 onto TCP TLS to bypass throttling.',
  },
  {
    key: 'zeltunBypassLan',
    title: 'Bypass LAN Subnets',
    desc: 'Keeps private LAN networks (192.168.x, 10.x) direct.',
  },
  {
    key: 'zeltunMssClamp',
    title: 'TCP MSS Clamping',
    desc: 'Caps TCP SYN segment size for PPPoE and LTE.',
  },
  {
    key: 'zeltunSniSniff',
    title: 'TLS SNI Inspection',
    desc: 'Reads ClientHello hostnames for diagnostics.',
  },
];

export const GAMING_QOS_ITEM: TunToggleItem = {
  key: 'zeltunGamingQos',
  title: 'Gaming & Voice UDP QoS',
  desc: 'Expands UDP buffers for low-jitter voice & games.',
};

export const MTU_PRESETS = [
  { value: 1420, label: '1420', hint: 'Safe' },
  { value: 1500, label: '1500', hint: 'Std' },
  { value: 9000, label: '9000', hint: 'Jumbo' },
];

export const RING_PRESETS = [2, 4, 8];
export const UDP_TIMEOUT_PRESETS = [30, 60, 120, 300];
export const MSS_PRESETS = [1320, 1360, 1400, 1440];

export interface TunPresetProfile {
  id: 'balanced' | 'gaming' | 'zeroleak';
  label: string;
  patch: Partial<Settings>;
}

export const TUN_PRESET_PROFILES: TunPresetProfile[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    patch: {
      tunEngine: 'zeltun',
      tunMtu: 1500,
      zeltunRingMb: 4,
      zeltunUdpTimeoutSec: 120,
      zeltunBlockQuic: true,
      zeltunGamingQos: true,
      zeltunCleanDns: true,
      zeltunStrictLeak: false,
      zeltunEnableNrpt: true,
      zeltunBlockIpv6: true,
      zeltunMssClamp: false,
      zeltunSniSniff: false,
      zeltunBypassLan: true,
    },
  },
  {
    id: 'gaming',
    label: 'Gaming',
    patch: {
      tunEngine: 'zeltun',
      tunMtu: 1500,
      zeltunRingMb: 8,
      zeltunUdpTimeoutSec: 300,
      zeltunBlockQuic: false,
      zeltunGamingQos: true,
      zeltunCleanDns: true,
      zeltunStrictLeak: false,
      zeltunEnableNrpt: true,
      zeltunBlockIpv6: true,
      zeltunMssClamp: false,
      zeltunSniSniff: false,
      zeltunBypassLan: true,
    },
  },
  {
    id: 'zeroleak',
    label: 'Zero-Leak',
    patch: {
      tunEngine: 'zeltun',
      tunMtu: 1420,
      zeltunRingMb: 4,
      zeltunUdpTimeoutSec: 120,
      zeltunBlockQuic: true,
      zeltunGamingQos: true,
      zeltunCleanDns: true,
      zeltunStrictLeak: true,
      zeltunEnableNrpt: true,
      zeltunBlockIpv6: true,
      zeltunMssClamp: false,
      zeltunSniSniff: false,
      zeltunBypassLan: true,
    },
  },
];

export const BALANCED_DEFAULT_SETTINGS: Partial<Settings> = {
  tunConfigVersion: 2,
  tunEngine: 'zeltun',
  tunMtu: 1500,
  zeltunBlockQuic: true,
  zeltunMssClamp: false,
  zeltunTcpMss: 1360,
  zeltunSniSniff: false,
  zeltunBypassLan: true,
  zeltunGamingQos: true,
  zeltunCleanDns: true,
  zeltunStrictLeak: false,
  zeltunEnableNrpt: true,
  zeltunBlockIpv6: true,
  zeltunUdpTimeoutSec: 120,
  zeltunRingMb: 4,
};

export function formatCompactBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function getMtuTag(mtu: number): string {
  if (mtu <= 1280) return 'Minimal';
  if (mtu <= 1440) return 'VPN Safe';
  if (mtu === 1500) return 'Std';
  if (mtu >= 4000) return 'Jumbo';
  return 'Custom';
}

export function areTunStatsEqual(a: ZeltunStats | null, b: ZeltunStats | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.isRunning === b.isRunning &&
    a.rxBytes === b.rxBytes &&
    a.txBytes === b.txBytes &&
    a.proxyBytes === b.proxyBytes &&
    a.directBytes === b.directBytes &&
    a.activeTcpConns === b.activeTcpConns &&
    a.activeUdpSessions === b.activeUdpSessions &&
    a.droppedPackets === b.droppedPackets
  );
}
