import { Headphones, Zap, Globe, Gamepad, Server, ObjectUngroup, Sliders, Settings as SettingsIcon } from '../icons';
import type { DnsPreset, PopularPreset } from '../types';

export const POPULAR_PRESETS: PopularPreset[] = [
  { id: 'discord', name: 'Discord', exe: 'Discord.exe', icon: Headphones },
  { id: 'telegram', name: 'Telegram', exe: 'Telegram.exe', icon: Zap },
  { id: 'chrome', name: 'Chrome', exe: 'chrome.exe', icon: Globe },
  { id: 'steam', name: 'Steam', exe: 'steam.exe', icon: Gamepad },
];

export const DNS_PRESETS: DnsPreset[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
    tag: 'Default',
  },
  {
    id: 'google',
    name: 'Google',
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
    tag: 'Global',
  },
  {
    id: 'shecan',
    name: 'Shecan',
    primary: '178.22.122.100',
    secondary: '185.51.200.2',
    tag: 'شکن',
  },
  {
    id: 'electro',
    name: 'Electro',
    primary: '78.157.42.101',
    secondary: '78.157.42.100',
    tag: 'الکترو',
  },
  {
    id: 'quad9',
    name: 'Quad9',
    primary: '9.9.9.9',
    secondary: '149.112.112.112',
    tag: 'Security',
  },
  {
    id: 'custom',
    name: 'Custom DNS',
    primary: '',
    secondary: '',
    tag: 'Manual',
  },
];

export const NAV_TABS = [
  { id: 'connect', icon: Zap, label: 'Connect & Stats', shortcut: '1' },
  { id: 'configs', icon: Server, label: 'Configs & Nodes', shortcut: '2' },
  { id: 'split', icon: ObjectUngroup, label: 'Split Tunnel', shortcut: '3' },
  { id: 'socks', icon: Sliders, label: 'Inbound & Network', shortcut: '4' },
  { id: 'app_settings', icon: SettingsIcon, label: 'App Settings', shortcut: '5' },
] as const;
