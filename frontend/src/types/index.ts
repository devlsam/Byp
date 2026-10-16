export interface TrafficStats {
  uploadSpeed: number;
  downloadSpeed: number;
  totalUpload: number;
  totalDownload: number;
}

export interface ConfigFormState {
  id: string;
  name: string;
  protocol: 'vless' | 'vmess' | 'trojan' | 'shadowsocks';
  server: string;
  port: number;
  uuid: string;
  password: string;
  method: string;
  flow: string;
  network: 'tcp' | 'ws' | 'grpc';
  security: 'none' | 'tls' | 'reality';
  serverName: string;
  path: string;
  hostHeader: string;
  fingerprint: string;
  publicKey: string;
  shortId: string;
  spiderX: string;
  rawJson: string;
}

export type AppTab = 'connect' | 'configs' | 'split' | 'socks' | 'app_settings';

export interface WireEndpoint {
  id: string;
  target: 'vpn' | 'direct';
  x1: number;
  y1: number;
}

export interface WirePath {
  id: string;
  target: 'vpn' | 'direct';
  pathD: string;
}

export interface VisualAppInfo {
  name: string;
  iconType: 'chat' | 'game' | 'browser' | 'music' | 'code' | 'default';
}

export interface DnsPreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tag: string;
}

export interface PopularPreset {
  id: string;
  name: string;
  exe: string;
  icon: React.ComponentType<{ className?: string }>;
}
