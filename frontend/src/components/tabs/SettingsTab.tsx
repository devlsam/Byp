import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Events, Updater, Browser } from '@wailsio/runtime';
import { Settings as SettingsIcon, Check, Zap, Globe, Sparkles, RefreshCw, ArrowDown, Github, ChevronRight } from '../../icons';
import { DNS_PRESETS } from '../../constants/presets';
import { AppService } from '../../../bindings/changeme';
import type { Settings } from '../../../bindings/changeme/internal/storage/models';
import type { DnsPreset } from '../../types';
import { toast } from '../../Toaster';
import { loading } from '../../LoadingOverlay';

interface SettingsTabProps {
  settings: Settings;
  coreVersion: string;
  dnsProvider: string;
  primaryDns: string;
  secondaryDns: string;
  setDnsProvider: (val: string) => void;
  setPrimaryDns: (val: string) => void;
  setSecondaryDns: (val: string) => void;
  onToggleAutoStart: () => void;
  onToggleAutoConnect: () => void;
  onSelectDnsPreset: (preset: DnsPreset) => void;
  onSaveCustomDns: () => void;
}

/**
 * Application preferences, auto-start, auto-connect, DNS resolvers, and core info tab.
 */
export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  coreVersion,
  dnsProvider,
  primaryDns,
  secondaryDns,
  setDnsProvider,
  setPrimaryDns,
  setSecondaryDns,
  onToggleAutoStart,
  onToggleAutoConnect,
  onSelectDnsPreset,
  onSaveCustomDns,
}) => {
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [updateStatus, setUpdateStatus] = useState<{
    type: 'available' | 'latest' | 'downloading' | 'ready' | 'error';
    message: string;
    version?: string;
  } | null>(null);
  const [skippedVersion, setSkippedVersion] = useState<string | null>(
    () => localStorage.getItem('byp_skip_update_version')
  );

  useEffect(() => {
    AppService.GetAppVersion()
      .then((v) => {
        if (v) setAppVersion(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unProg = Events.On(Updater.Events.DownloadProgress, (e: any) => {
      if (e?.data && e.data.total > 0) {
        const percent = Math.min(100, Math.round((e.data.written / e.data.total) * 100));
        setDownloadProgress(percent);
        setUpdateStatus((prev) => ({
          type: 'downloading',
          message: `Downloading update (${percent}%)...`,
          version: prev?.version,
        }));
      }
    });

    const unReady = Events.On(Updater.Events.UpdateReady, (e: any) => {
      setIsUpdating(false);
      setUpdateStatus({
        type: 'ready',
        message: 'Update downloaded! Ready to restart.',
        version: e?.data?.version,
      });
      toast.success('Update ready! Restart to apply.');
    });

    const unErr = Events.On(Updater.Events.Error, (e: any) => {
      setIsUpdating(false);
      setUpdateStatus({
        type: 'error',
        message: e?.data?.message || 'Update failed',
      });
    });

    return () => {
      unProg();
      unReady();
      unErr();
    };
  }, []);

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    setUpdateStatus(null);
    try {
      const res = await AppService.CheckForUpdates();
      if (res && res.available) {
        setUpdateStatus({
          type: 'available',
          message: `New version ${res.version} is available!`,
          version: res.version,
        });
        toast.info(`New version ${res.version} found!`);
      } else {
        const curVer = res?.currentVersion || appVersion;
        setUpdateStatus({
          type: 'latest',
          message: `You are on the latest version (v${curVer}).`,
        });
        toast.success('Client is up to date.');
      }
    } catch (err: any) {
      setUpdateStatus({
        type: 'error',
        message: err?.message || 'Could not reach GitHub Releases API',
      });
      toast.error('Check failed. Ensure internet connection.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setIsUpdating(true);
    setDownloadProgress(0);
    setUpdateStatus((prev) => ({
      type: 'downloading',
      message: 'Starting download from GitHub...',
      version: prev?.version,
    }));
    loading.show({
      title: 'Downloading Update',
      message: 'Fetching release packages from GitHub...',
      variant: 'update',
      progress: 0,
      timeout: 0,
    });
    try {
      await AppService.DownloadAndInstallUpdate();
    } catch (err: any) {
      loading.hide();
      setIsUpdating(false);
      setUpdateStatus({
        type: 'error',
        message: err?.message || 'Download failed',
      });
      toast.error('Failed to download update');
    }
  };

  const handleRestart = async () => {
    loading.show({
      title: 'Restarting Client',
      message: 'Applying update and launching newest version...',
      variant: 'update',
      progress: 100,
      timeout: 5000,
    });
    try {
      await AppService.RestartApp();
    } catch (err: any) {
      loading.hide();
      toast.error('Failed to restart automatically');
    }
  };

  const handleReportBug = () => {
    const url = 'https://github.com/devlsam/Beep-client/issues';
    try {
      Browser.OpenURL(url);
    } catch (_) {
      try {
        window.open(url, '_blank');
      } catch (e) {
        console.error('Failed to open GitHub issues:', e);
      }
    }
  };

  return (
    <motion.div
      key="app_settings"
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex-1 flex flex-col p-5 space-y-4 overflow-y-auto no-scrollbar"
    >
      <div className="flex flex-col space-y-1">
        <h2 className="text-sm font-semibold text-white tracking-tight flex items-center space-x-2">
          <SettingsIcon className="w-4 h-4 text-zinc-300" />
          <span>Application Settings</span>
        </h2>
        <p className="text-[11px] text-zinc-400 font-normal">
          General client preferences, system behavior, and runtime options.
        </p>
      </div>

      {/* General Preferences */}
      <div className="modern-surface rounded-2xl p-4 space-y-3 border border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">General Behavior</span>
          <span className="text-[10px] text-zinc-500">System & Lifecycle</span>
        </div>

        <div className="space-y-2">
          {/* 1. Start with Windows */}
          <div
            onClick={onToggleAutoStart}
            className="flex items-center justify-between p-3 rounded-xl bg-[#121317] border border-white/5 hover:border-white/15 cursor-pointer transition group"
          >
            <div className="space-y-0.5 pr-2">
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-semibold text-white group-hover:text-zinc-200 transition">
                  Start with Windows
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 border border-white/10">
                  Default: ON
                </span>
              </div>
              <div className="text-[10px] text-zinc-400">
                Launch client automatically on system boot (Starts minimized to Tray)
              </div>
            </div>
            <div
              className={`w-9 h-5 rounded-full transition-colors duration-200 border flex items-center px-0.5 shrink-0 ${
                (settings.autoStart ?? true)
                  ? 'bg-white border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.25)] justify-end'
                  : 'bg-white/10 border-white/15 justify-start'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-200 flex items-center justify-center ${
                  (settings.autoStart ?? true) ? 'bg-black shadow' : 'bg-zinc-500'
                }`}
              >
                {(settings.autoStart ?? true) && (
                  <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                )}
              </div>
            </div>
          </div>

          {/* 2. Auto-Connect on Launch */}
          <div
            onClick={onToggleAutoConnect}
            className="flex items-center justify-between p-3 rounded-xl bg-[#121317] border border-white/5 hover:border-white/15 cursor-pointer transition group"
          >
            <div className="space-y-0.5 pr-2">
              <div className="text-[11px] font-semibold text-white group-hover:text-zinc-200 transition">
                Auto-Connect on Launch
              </div>
              <div className="text-[10px] text-zinc-400">
                Automatically initiate connection to active profile when client opens
              </div>
            </div>
            <div
              className={`w-9 h-5 rounded-full transition-colors duration-200 border flex items-center px-0.5 shrink-0 ${
                settings.autoConnect
                  ? 'bg-white border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.25)] justify-end'
                  : 'bg-white/10 border-white/15 justify-start'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-200 flex items-center justify-center ${
                  settings.autoConnect ? 'bg-black shadow' : 'bg-zinc-500'
                }`}
              >
                {settings.autoConnect && (
                  <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                )}
              </div>
            </div>
          </div>

          {/* 3. Performance Mode Trigger */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#121317] border border-white/10">
            <div className="space-y-0.5 pr-3">
              <div className="flex items-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-zinc-300" />
                <span className="text-[11px] font-semibold text-white">
                  Performance Mode (Hide & Flush RAM)
                </span>
              </div>
              <div className="text-[10px] text-zinc-400">
                Frees WebView2 & Go memory pages and minimizes the application to System Tray
              </div>
            </div>
            <button
              type="button"
              onClick={() => AppService.HideWindow()}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-medium transition shrink-0 flex items-center space-x-1 cursor-pointer"
            >
              <span>Enter Mode</span>
            </button>
          </div>
        </div>
      </div>

      {/* DNS & Anti-Sanction Configuration */}
      <div className="modern-surface rounded-2xl p-4 space-y-3 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="w-3.5 h-3.5 text-zinc-300" />
            <span className="text-xs font-semibold text-zinc-100">
              DNS Resolvers & Anti-Sanction
            </span>
          </div>
          <div className="flex items-center space-x-1.5 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            <span className="text-[10px] font-mono text-zinc-300">
              {primaryDns || '1.1.1.1'}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 font-normal leading-relaxed">
          Select an optimized resolver or enter custom addresses applied directly to the TUN virtual adapter.
        </p>

        {/* Presets Grid */}
        <div className="grid grid-cols-2 gap-2">
          {DNS_PRESETS.map((p) => {
            const isSelected = dnsProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectDnsPreset(p)}
                className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-white/[0.12] border-white/30 text-white shadow-sm'
                    : 'bg-[#121317] border-white/5 text-zinc-400 hover:border-white/15 hover:text-zinc-200 hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-[11px] font-semibold tracking-tight ${
                      isSelected ? 'text-white' : 'text-zinc-200'
                    }`}
                  >
                    {p.name}
                  </span>
                  <div className="flex items-center space-x-1">
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-sans ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-white/5 text-zinc-400'
                      }`}
                    >
                      {p.tag}
                    </span>
                    {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[2.5]" />}
                  </div>
                </div>
                <div className="mt-1 text-[10px] font-mono text-zinc-400">
                  {p.primary || 'Manual IP'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom / Editable DNS Input Fields */}
        <div className="p-3 rounded-xl bg-[#121317] border border-white/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
              Custom Resolver Settings
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">IPv4 Addresses</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 h-4">
                <span>Primary DNS</span>
              </div>
              <input
                type="text"
                value={primaryDns}
                onChange={(e) => {
                  setPrimaryDns(e.target.value);
                  setDnsProvider('custom');
                }}
                placeholder="1.1.1.1"
                className="w-full bg-black/50 border border-white/10 focus:border-white/30 focus:ring-1 focus:ring-white/10 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 font-mono outline-none transition"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 h-4">
                <span>Secondary DNS</span>
                <span className="text-[9px] text-zinc-500 font-sans">Optional</span>
              </div>
              <input
                type="text"
                value={secondaryDns}
                onChange={(e) => {
                  setSecondaryDns(e.target.value);
                  setDnsProvider('custom');
                }}
                placeholder="1.0.0.1"
                className="w-full bg-black/50 border border-white/10 focus:border-white/30 focus:ring-1 focus:ring-white/10 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 font-mono outline-none transition"
              />
            </div>
          </div>

          <div className="pt-1 flex justify-end">
            <button
              type="button"
              onClick={onSaveCustomDns}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition active:scale-95 shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Check className="w-3 h-3 text-black stroke-[2.5]" />
              <span>Save & Apply DNS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Software Updates & Version */}
      <div className="modern-surface rounded-2xl p-4 space-y-3 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-white" />
            <span className="text-xs font-semibold text-zinc-200">Software Updates</span>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
            v{appVersion}
          </span>
        </div>

        <p className="text-[11px] text-zinc-400">
          Automatically checks GitHub Releases for new desktop client versions.
        </p>

        {skippedVersion && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-[11px]">
            <span className="text-zinc-300">
              Notification suppressed for <span className="font-mono text-white font-semibold">{skippedVersion}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('byp_skip_update_version');
                setSkippedVersion(null);
                toast.info('Auto-update prompt preference reset');
              }}
              className="text-zinc-300 hover:text-white transition text-[10px] font-semibold underline underline-offset-2 cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}

        {/* Update status message / state */}
        {updateStatus && (
          <div
            className={`p-2.5 rounded-xl text-xs font-medium border ${
              updateStatus.type === 'available'
                ? 'bg-white/10 border-white/20 text-white'
                : updateStatus.type === 'downloading'
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                : updateStatus.type === 'ready'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : updateStatus.type === 'latest'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{updateStatus.message}</span>
              {updateStatus.version && (
                <span className="font-mono text-[10px] bg-white/10 px-1.5 py-0.5 rounded">
                  {updateStatus.version}
                </span>
              )}
            </div>
            {updateStatus.type === 'downloading' && (
              <div className="mt-2 w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-white h-full transition-all duration-150 shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-1">
          {updateStatus?.type === 'ready' ? (
            <button
              type="button"
              onClick={handleRestart}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition active:scale-95 shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-black" />
              <span>Restart & Apply Update</span>
            </button>
          ) : updateStatus?.type === 'available' ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={handleDownloadUpdate}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition active:scale-95 shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowDown className="w-3 h-3 text-black" />
              <span>{isUpdating ? 'Downloading...' : 'Download & Install'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isChecking}
              onClick={handleCheckUpdates}
              className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-white text-xs font-medium transition active:scale-95 shadow-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 text-zinc-300 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking...' : 'Check for Updates'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Report a Bug / GitHub Forwarding */}
      <div
        onClick={handleReportBug}
        className="modern-surface rounded-2xl p-3.5 border border-white/10 hover:border-white/20 transition flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 group-hover:bg-white/15 transition">
            <Github className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white group-hover:text-white transition">
              Report a Bug
            </div>
            <div className="text-[10px] text-zinc-400">
              Open an issue or submit feedback on GitHub
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleReportBug();
          }}
          className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition active:scale-95 shadow-sm flex items-center space-x-1.5 cursor-pointer shrink-0"
        >
          <span>GitHub</span>
          <ChevronRight className="w-3 h-3 text-black stroke-[2.5]" />
        </button>
      </div>
    </motion.div>
  );
};
