import type { VisualAppInfo } from '../types';

/**
 * Formats a byte count into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Formats transfer rate in bytes per second.
 */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Formats duration in seconds into HH:MM:SS.
 */
export function formatTimer(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Resolves application metadata and icon classification based on binary name/path.
 */
export function getAppVisual(pathOrName: string): VisualAppInfo {
  const base = (pathOrName.split(/[\\/]/).pop() || pathOrName).toLowerCase();

  if (base.includes('discord')) {
    return { name: 'Discord', iconType: 'chat' };
  }
  if (base.includes('telegram')) {
    return { name: 'Telegram Desktop', iconType: 'chat' };
  }
  if (base.includes('chrome')) {
    return { name: 'Google Chrome', iconType: 'browser' };
  }
  if (base.includes('msedge') || (base.includes('edge') && !base.includes('knowledge'))) {
    return { name: 'Microsoft Edge', iconType: 'browser' };
  }
  if (base.includes('steam')) {
    return { name: 'Steam', iconType: 'game' };
  }
  if (base.includes('spotify')) {
    return { name: 'Spotify', iconType: 'music' };
  }
  if (base.includes('code') || base.includes('devenv') || base.includes('git')) {
    return { name: base.replace(/\.exe$/i, ''), iconType: 'code' };
  }

  const cleanName = base.replace(/\.exe$/i, '');
  const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  return {
    name: formattedName,
    iconType: 'default',
  };
}
