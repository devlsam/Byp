import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Events, Clipboard, Updater } from '@wailsio/runtime';
import { AppService } from '../bindings/changeme';
import type { Profile, Settings, Subscription } from '../bindings/changeme/internal/storage/models';
import type { ProcessAppInfo } from '../bindings/changeme/internal/tun/models';
import type { UpdateInfo } from '../bindings/changeme/models';

import { toast, Toaster } from './Toaster';
import { loading, LoadingOverlay } from './LoadingOverlay';
import { confirmDialog, ConfirmModal } from './ConfirmModal';

import { Sidebar } from './components/layout/Sidebar';
import { TitleBar } from './components/layout/TitleBar';
import { ConnectTab } from './components/tabs/ConnectTab';
import { ConfigsTab } from './components/tabs/ConfigsTab';
import { SplitTab } from './components/tabs/SplitTab';
import { SocksTab } from './components/tabs/SocksTab';
import { SettingsTab } from './components/tabs/SettingsTab';

import { SubscriptionModal } from './components/modals/SubscriptionModal';
import { ImportModal } from './components/modals/ImportModal';
import { ConfigEditModal } from './components/modals/ConfigEditModal';
import { RunningAppsModal } from './components/modals/RunningAppsModal';
import { UpdatePromptModal } from './components/modals/UpdatePromptModal';

import { parseProfileToForm, buildOutboundFromForm } from './utils/profileParser';
import type { AppTab, ConfigFormState, DnsPreset } from './types';

/**
 * Main application coordinator component.
 * Manages core state, bindings, lifecycle events, and modal orchestration.
 */
export default function App() {
  // Navigation: 5 Focused Tabs
  const [selectedTab, setSelectedTab] = useState<AppTab>('connect');

  // Application State
  const [connected, setConnected] = useState<boolean>(false);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [mode, setMode] = useState<string>('tun');
  const [coreVersion, setCoreVersion] = useState<string>('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [settings, setSettings] = useState<Settings>({
    mode: 'tun',
    socksPort: 10808,
    httpPort: 10809,
    selectedProfileId: '',
    autoConnect: false,
    autoStart: true,
    dnsProvider: 'cloudflare',
    primaryDns: '1.1.1.1',
    secondaryDns: '1.0.0.1',
    splitTunnelMode: 'all',
    splitTunnelApps: [],
  });

  const [dnsProvider, setDnsProvider] = useState<string>('cloudflare');
  const [primaryDns, setPrimaryDns] = useState<string>('1.1.1.1');
  const [secondaryDns, setSecondaryDns] = useState<string>('1.0.0.1');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pingingMap, setPingingMap] = useState<Record<string, boolean>>({});
  const [pingingAll, setPingingAll] = useState<boolean>(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);

  // Modals State
  const [showSubModal, setShowSubModal] = useState<boolean>(false);
  const [subName, setSubName] = useState<string>('');
  const [subUrl, setSubUrl] = useState<string>('');
  const [subLoading, setSubLoading] = useState<boolean>(false);
  const [subError, setSubError] = useState<string>('');

  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importError, setImportError] = useState<string>('');
  const [showQuickPicker, setShowQuickPicker] = useState<boolean>(false);

  // Auto-Update Modal State
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);

  // Segmented Config View Mode: 'all' | 'subs' | 'manual'
  const [configViewMode, setConfigViewMode] = useState<'all' | 'subs' | 'manual'>('all');
  const [updatingSubs, setUpdatingSubs] = useState<boolean>(false);
  const [updatingSubId, setUpdatingSubId] = useState<string | null>(null);
  const hasAutoUpdatedSubs = useRef(false);

  // Config Editor / Custom Node Modal State
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [isNewConfig, setIsNewConfig] = useState<boolean>(false);
  const [editTab, setEditTab] = useState<'form' | 'json'>('form');
  const [editForm, setEditForm] = useState<ConfigFormState>({
    id: '',
    name: 'Custom Node',
    protocol: 'vless',
    server: '',
    port: 443,
    uuid: '',
    password: '',
    method: 'aes-256-gcm',
    flow: 'none',
    network: 'tcp',
    security: 'reality',
    serverName: '',
    path: '',
    hostHeader: '',
    fingerprint: 'chrome',
    publicKey: '',
    shortId: '',
    spiderX: '',
    rawJson: '',
  });
  const [editSaving, setEditSaving] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>('');

  // Split Tunneling & Running Apps Modal State
  const [showRunningAppsModal, setShowRunningAppsModal] = useState<boolean>(false);
  const [runningApps, setRunningApps] = useState<ProcessAppInfo[]>([]);
  const [runningAppsLoading, setRunningAppsLoading] = useState<boolean>(false);
  const [appSearchQuery, setAppSearchQuery] = useState<string>('');

  // Visual Flow Graph State
  const [systemGateway, setSystemGateway] = useState<'vpn' | 'direct'>(() => {
    return (localStorage.getItem('split_system_gateway') as any) || 'vpn';
  });

  const [appRoutes, setAppRoutes] = useState<Record<string, 'vpn' | 'direct'>>(() => {
    try {
      const saved = localStorage.getItem('split_app_routes');
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  });

  // Fetch initial state
  const refreshData = async () => {
    try {
      const state = await AppService.GetState();
      setConnected(state.connected);
      setActiveProfileId(state.activeProfileId);
      setMode(state.activeMode || state.settings?.mode || 'tun');
      setCoreVersion(state.coreVersion);
      if (state.settings) {
        setSettings(state.settings);
        setDnsProvider(state.settings.dnsProvider || 'cloudflare');
        setPrimaryDns(state.settings.primaryDns || '1.1.1.1');
        setSecondaryDns(state.settings.secondaryDns || '1.0.0.1');
        if (state.settings.selectedProfileId) {
          setSelectedProfileId(state.settings.selectedProfileId);
        }

        // Restore or synchronize visual split tunneling state
        const savedSys =
          state.settings.splitSystemGateway || localStorage.getItem('split_system_gateway');
        const savedRoutesStr =
          state.settings.splitAppRoutes || localStorage.getItem('split_app_routes');
        let currentRoutes: Record<string, 'vpn' | 'direct'> = {};
        try {
          if (savedRoutesStr) currentRoutes = JSON.parse(savedRoutesStr);
        } catch (_) {}

        let effectiveSys: 'vpn' | 'direct' =
          savedSys === 'direct' || savedSys === 'vpn' ? savedSys : 'vpn';
        if (!savedSys && state.settings.splitTunnelMode) {
          effectiveSys = state.settings.splitTunnelMode === 'whitelist' ? 'direct' : 'vpn';
        }

        const appsList = state.settings.splitTunnelApps || [];
        appsList.forEach((a) => {
          if (!currentRoutes[a]) {
            currentRoutes[a] = effectiveSys === 'vpn' ? 'direct' : 'vpn';
          }
        });

        // Clean up any routes that are no longer in appsList
        const appsSet = new Set(appsList);
        Object.keys(currentRoutes).forEach((k) => {
          if (!appsSet.has(k)) {
            delete currentRoutes[k];
          }
        });

        setSystemGateway(effectiveSys);
        setAppRoutes(currentRoutes);
        localStorage.setItem('split_system_gateway', effectiveSys);
        localStorage.setItem('split_app_routes', JSON.stringify(currentRoutes));
      }

      const pList = await AppService.GetProfiles();
      setProfiles(pList || []);
      if (!selectedProfileId && pList && pList.length > 0) {
        setSelectedProfileId(pList[0].id);
      }

      const sList = await AppService.GetSubscriptions();
      setSubscriptions(sList || []);
    } catch (err) {
      console.error('Failed to load state:', err);
    }
  };

  useEffect(() => {
    refreshData().then(async () => {
      // Auto-update subscriptions once on startup if any exist
      if (!hasAutoUpdatedSubs.current) {
        hasAutoUpdatedSubs.current = true;
        try {
          const subs = await AppService.GetSubscriptions();
          if (subs && subs.length > 0) {
            toast.info('Updating Subscriptions', `Auto-syncing ${subs.length} subscription(s)...`);
            const count = await AppService.UpdateAllSubscriptions();
            await refreshData();
            toast.success('Subscriptions Updated', `Successfully updated ${count} subscription(s).`);
          }
        } catch (err: any) {
          console.error('Auto subscription update failed:', err);
        }
      }
    });

    // Non-intrusive background update check on app launch (delayed by 2.5s for smooth startup)
    const updateCheckTimer = setTimeout(async () => {
      try {
        const info = await AppService.CheckForUpdates();
        if (info && info.available) {
          const skipped = localStorage.getItem('byp_skip_update_version');
          if (skipped !== info.version) {
            setAvailableUpdate(info);
            setShowUpdateModal(true);
          }
        }
      } catch (err) {
        console.debug('Background update check skipped/failed:', err);
      }
    }, 2500);

    // Event listeners
    const unbindPing = Events.On('profile:ping', (event: any) => {
      if (event && event.data) {
        const { id, ping } = event.data;
        setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ping } : p)));
        setPingingMap((prev) => ({ ...prev, [id]: false }));
      }
    });

    const unbindVpnStatus = Events.On('vpn:status', (event: any) => {
      if (event && event.data) {
        const status = event.data;
        setConnected(status.connected);
        if (status.activeProfileId) {
          setActiveProfileId(status.activeProfileId);
          setSelectedProfileId(status.activeProfileId);
        } else if (!status.connected) {
          setActiveProfileId('');
          setSessionSeconds(0);
        }
        if (status.activeMode) {
          setMode(status.activeMode);
        }
      }
    });

    // Global Updater events (progress, ready, error)
    const unProg = Events.On(Updater.Events.DownloadProgress, (e: any) => {
      if (e?.data && e.data.total > 0) {
        const percent = Math.min(100, Math.round((e.data.written / e.data.total) * 100));
        loading.update({
          title: 'Downloading Update',
          message: 'Fetching release packages from GitHub...',
          progress: percent,
        });
      }
    });

    const unReady = Events.On(Updater.Events.UpdateReady, (e: any) => {
      loading.update({
        title: 'Update Downloaded',
        message: 'Restarting application to apply update...',
        progress: 100,
        successTitle: 'Update Downloaded',
        successHighlight: 'Ready to Apply',
      });
      setTimeout(() => {
        AppService.RestartApp().catch(() => {});
      }, 1500);
    });

    const unErr = Events.On(Updater.Events.Error, (e: any) => {
      loading.hide();
      toast.error('Update Failed', e?.data?.message || 'Download/install failed');
    });

    return () => {
      clearTimeout(updateCheckTimer);
      unbindPing();
      unbindVpnStatus();
      unProg();
      unReady();
      unErr();
    };
  }, []);

  // Keyboard navigation shortcuts [1] [2] [3] [4] [5]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === '1') setSelectedTab('connect');
      if (e.key === '2') setSelectedTab('configs');
      if (e.key === '3') setSelectedTab('split');
      if (e.key === '4') setSelectedTab('socks');
      if (e.key === '5') setSelectedTab('app_settings');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Connection session timer
  useEffect(() => {
    let timer: any;
    if (connected) {
      timer = setInterval(() => {
        setSessionSeconds((s) => s + 1);
      }, 1000);
    } else {
      setSessionSeconds(0);
    }
    return () => clearInterval(timer);
  }, [connected]);

  // Optimistic Zero-Lag Connect Toggle
  const handleToggleConnect = () => {
    const targetId = selectedProfileId || profiles[0]?.id;
    if (!targetId && !connected) {
      toast.error('No Config Selected', 'Please select or add a configuration profile first.');
      return;
    }

    const nextState = !connected;
    setConnected(nextState);
    if (nextState) {
      setActiveProfileId(targetId);
    } else {
      setActiveProfileId('');
    }

    if (nextState) {
      AppService.Connect(targetId, mode)
        .catch((err: any) => {
          setConnected(false);
          setActiveProfileId('');
          toast.error('Connection Failed', err?.message || String(err));
        })
        .finally(() => {
          refreshData();
        });
    } else {
      AppService.Disconnect()
        .catch((err: any) => {
          toast.error('Disconnect Error', err?.message || String(err));
        })
        .finally(() => {
          refreshData();
        });
    }
  };

  // Change routing mode
  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    const updated = { ...settings, mode: newMode };
    setSettings(updated);
    AppService.SaveSettings(updated);

    const modeLabels: Record<string, { title: string; desc: string }> = {
      tun: { title: 'TUN Mode Activated', desc: 'Virtual network adapter routing system traffic' },
      system_proxy: { title: 'System Proxy Enabled', desc: 'Windows HTTP/SOCKS system proxy configured' },
      direct: { title: 'Direct Mode Active', desc: 'Proxy bypassed for direct internet connection' },
      pac: { title: 'PAC Routing Active', desc: 'Automatic proxy configuration script applied' },
    };
    const info = modeLabels[newMode] || {
      title: 'Mode Changed',
      desc: `Operating mode set to ${newMode.toUpperCase()}`,
    };
    toast.info(info.title, info.desc);

    if (connected && activeProfileId) {
      AppService.Connect(activeProfileId, newMode).catch(() => {});
    }
  };

  // Windows Auto-Start Toggle
  const handleToggleAutoStart = async () => {
    const current = settings.autoStart ?? true;
    const nextVal = !current;
    const updatedSettings: Settings = {
      ...settings,
      autoStart: nextVal,
    };
    setSettings(updatedSettings);
    try {
      await AppService.SaveSettings(updatedSettings);
      toast.success(
        nextVal ? 'Start with Windows Enabled' : 'Start with Windows Disabled',
        nextVal
          ? 'The client will now launch automatically when Windows boots.'
          : 'Auto-launch on Windows startup has been disabled.'
      );
    } catch (err: any) {
      toast.error('Failed to change startup setting', err?.message || String(err));
    }
  };

  // Auto-Connect on Launch Toggle
  const handleToggleAutoConnect = async () => {
    const nextVal = !settings.autoConnect;
    const updatedSettings: Settings = {
      ...settings,
      autoConnect: nextVal,
    };
    setSettings(updatedSettings);
    try {
      await AppService.SaveSettings(updatedSettings);
      toast.info(
        nextVal ? 'Auto-Connect Enabled' : 'Auto-Connect Disabled',
        nextVal ? 'Will connect automatically upon app launch.' : 'Will require manual connection.'
      );
    } catch (err: any) {
      toast.error('Failed to update auto-connect', err?.message || String(err));
    }
  };

  // DNS Preset Selection
  const handleSelectDnsPreset = async (preset: DnsPreset) => {
    setDnsProvider(preset.id);
    if (preset.id !== 'custom') {
      setPrimaryDns(preset.primary);
      setSecondaryDns(preset.secondary);
      const updatedSettings: Settings = {
        ...settings,
        dnsProvider: preset.id,
        primaryDns: preset.primary,
        secondaryDns: preset.secondary,
      };
      setSettings(updatedSettings);
      try {
        await AppService.SaveSettings(updatedSettings);
        toast.success(
          'DNS Resolver Updated',
          `Using ${preset.name} (${preset.primary}${preset.secondary ? ' / ' + preset.secondary : ''})`
        );
      } catch (err: any) {
        toast.error('Failed to save DNS', err?.message || String(err));
      }
    }
  };

  // Custom DNS Save
  const handleSaveCustomDns = async () => {
    const p = primaryDns.trim();
    const s = secondaryDns.trim();
    if (!p) {
      toast.error('Invalid DNS', 'Primary DNS IP address is required.');
      return;
    }
    const updatedSettings: Settings = {
      ...settings,
      dnsProvider: 'custom',
      primaryDns: p,
      secondaryDns: s,
    };
    setSettings(updatedSettings);
    setDnsProvider('custom');
    try {
      await AppService.SaveSettings(updatedSettings);
      toast.success('Custom DNS Saved', `Primary: ${p}${s ? ' | Secondary: ' + s : ''}`);
    } catch (err: any) {
      toast.error('Failed to save DNS', err?.message || String(err));
    }
  };

  // Split Tunneling & Visual Flow Handlers
  const applyVisualRouting = async (
    newSystemGateway: 'vpn' | 'direct',
    newAppRoutes: Record<string, 'vpn' | 'direct'>,
    appsList: string[]
  ) => {
    setSystemGateway(newSystemGateway);
    setAppRoutes(newAppRoutes);
    localStorage.setItem('split_system_gateway', newSystemGateway);
    localStorage.setItem('split_app_routes', JSON.stringify(newAppRoutes));

    let backendMode: 'all' | 'whitelist' | 'blacklist' = 'all';
    let backendApps: string[] = [];

    if (newSystemGateway === 'direct') {
      backendMode = 'whitelist';
      backendApps = appsList.filter((a) => (newAppRoutes[a] || 'vpn') === 'vpn');
    } else {
      const directApps = appsList.filter((a) => (newAppRoutes[a] || 'vpn') === 'direct');
      if (directApps.length > 0) {
        backendMode = 'blacklist';
        backendApps = directApps;
      } else {
        backendMode = 'all';
        backendApps = [];
      }
    }

    const updatedSettings: Settings = {
      ...settings,
      splitTunnelMode: backendMode,
      splitTunnelApps: appsList,
      splitDriverApps: backendApps,
      splitSystemGateway: newSystemGateway,
      splitAppRoutes: JSON.stringify(newAppRoutes),
    };
    setSettings(updatedSettings);

    try {
      await AppService.SaveSettings(updatedSettings);
      await AppService.SaveSplitTunnelConfig(backendMode, backendApps);
    } catch (err: any) {
      console.error('Failed to save split tunnel config', err);
    }
  };

  const handleSelectExe = async () => {
    try {
      const selected = await AppService.SelectAppExecutable();
      if (!selected) return;
      const currentApps = settings.splitTunnelApps || [];
      const baseName = selected.split(/[\\/]/).pop() || selected;
      const alreadyExists = currentApps.some(
        (a) =>
          a.toLowerCase() === selected.toLowerCase() ||
          a.toLowerCase() === baseName.toLowerCase()
      );
      if (alreadyExists) return;
      const updatedApps = [...currentApps, selected];
      const defaultRoute: 'vpn' | 'direct' = systemGateway === 'vpn' ? 'direct' : 'vpn';
      const updatedRoutes = { ...appRoutes, [selected]: defaultRoute };
      await applyVisualRouting(systemGateway, updatedRoutes, updatedApps);
    } catch (err: any) {
      console.error('File Selection Error', err);
    }
  };

  const handleOpenRunningApps = async () => {
    setShowRunningAppsModal(true);
    setRunningAppsLoading(true);
    setAppSearchQuery('');
    try {
      const apps = await AppService.GetRunningApps();
      setRunningApps(apps || []);
    } catch (err: any) {
      console.error('Running Apps Error', err);
    } finally {
      setRunningAppsLoading(false);
    }
  };

  const handleAddRunningApp = async (app: { name: string; path: string }) => {
    try {
      const currentApps = settings.splitTunnelApps || [];
      const baseName = app.name;
      const alreadyExists = currentApps.some(
        (a) =>
          a.toLowerCase() === app.path.toLowerCase() ||
          a.toLowerCase() === baseName.toLowerCase()
      );
      if (alreadyExists) return;
      const updatedApps = [...currentApps, app.path];
      const defaultRoute: 'vpn' | 'direct' = systemGateway === 'vpn' ? 'direct' : 'vpn';
      const updatedRoutes = { ...appRoutes, [app.path]: defaultRoute };
      await applyVisualRouting(systemGateway, updatedRoutes, updatedApps);
    } catch (err: any) {
      console.error('Failed to add running app', err);
    }
  };

  const handleAddPreset = async (preset: { name: string; exe: string }) => {
    try {
      const currentApps = settings.splitTunnelApps || [];
      const already = currentApps.some(
        (a) =>
          a.toLowerCase().includes(preset.exe.toLowerCase()) ||
          a.toLowerCase().includes(preset.name.toLowerCase())
      );
      if (already) return;

      let targetPath = preset.exe;
      try {
        const running = await AppService.GetRunningApps();
        const match = running?.find(
          (r) =>
            r.name.toLowerCase() === preset.exe.toLowerCase() ||
            r.name.toLowerCase().includes(preset.name.toLowerCase())
        );
        if (match && match.path) {
          targetPath = match.path;
        }
      } catch (_) {}

      const updatedApps = [...currentApps, targetPath];
      const defaultRoute: 'vpn' | 'direct' = systemGateway === 'vpn' ? 'direct' : 'vpn';
      const updatedRoutes = { ...appRoutes, [targetPath]: defaultRoute };
      await applyVisualRouting(systemGateway, updatedRoutes, updatedApps);
    } catch (err: any) {
      console.error('Failed to add preset', err);
    }
  };

  const handleClearAllApps = async () => {
    if (!settings.splitTunnelApps || settings.splitTunnelApps.length === 0) return;
    const ok = await confirmDialog.ask({
      title: 'Clear Application Rules',
      message: `Are you sure you want to remove all ${settings.splitTunnelApps.length} configured application rules?`,
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash',
    });
    if (ok) {
      await applyVisualRouting(systemGateway, {}, []);
    }
  };

  const filteredRunningApps = useMemo(() => {
    if (!appSearchQuery.trim()) return runningApps;
    const q = appSearchQuery.toLowerCase();
    return runningApps.filter(
      (app) => app.name.toLowerCase().includes(q) || app.path.toLowerCase().includes(q)
    );
  }, [runningApps, appSearchQuery]);

  // Emergency Reset Network
  const handleResetNetwork = async () => {
    const ok = await confirmDialog.ask({
      title: 'Reset Network',
      message:
        'This will reset Windows system proxy and flush all virtual TUN routing tables. Continue?',
      confirmText: 'Reset Network',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'warning',
    });
    if (!ok) return;

    try {
      setConnected(false);
      setActiveProfileId('');
      await AppService.ResetNetwork();
      await refreshData();
    } catch (err: any) {
      console.error('Reset Failed', err);
    }
  };

  // Import from clipboard or manual
  const handleImportClipboardDirect = async () => {
    try {
      let text = '';
      try {
        text = await Clipboard.Text();
      } catch (e) {
        text = await navigator.clipboard.readText();
      }

      const isProxyLink =
        /vless:\/\/|vmess:\/\/|trojan:\/\/|ss:\/\/|hysteria2?:\/\/|tuic:\/\//i.test(text || '');

      if (!text || text.trim() === '' || !isProxyLink) {
        setImportText(text ? text.trim() : '');
        setShowImportModal(true);
        return;
      }

      const lines = text.trim().split('\n').filter((l) => l.trim().length > 0);
      const firstLine = lines[0].trim();
      let previewTag = '';
      try {
        const hashIdx = firstLine.indexOf('#');
        if (hashIdx !== -1) {
          previewTag = decodeURIComponent(firstLine.slice(hashIdx + 1));
        }
      } catch (_) {}

      const nodeSummary = previewTag
        ? `"${previewTag}" ${lines.length > 1 ? `(+${lines.length - 1} more)` : ''}`
        : `${lines.length} configuration(s)`;

      const shouldImport = await confirmDialog.ask({
        title: 'Import from Clipboard',
        message: `Found ${nodeSummary} in your clipboard. Do you want to import this configuration now?`,
        confirmText: 'Import',
        cancelText: 'Edit / Manual',
        isDestructive: false,
        icon: 'question',
      });

      if (!shouldImport) {
        setImportText(text.trim());
        setShowImportModal(true);
        return;
      }

      const startTime = Date.now();
      loading.show({
        title: 'Importing Configurations',
        message: 'Parsing protocols and building proxy nodes...',
        variant: 'terminal',
        timeout: 6500,
      });

      await AppService.ImportFromClipboard(text.trim());
      await refreshData();
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 5000 - elapsed);
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }
      loading.hide();
    } catch (err: any) {
      loading.hide();
      setImportText('');
      setShowImportModal(true);
      toast.error('Import Failed', err?.message || 'Failed to parse configurations');
    }
  };

  const handleImportManual = async () => {
    if (!importText.trim()) return;
    setImportLoading(true);
    setImportError('');
    setShowImportModal(false);

    const startTime = Date.now();
    loading.show({
      title: 'Importing Configurations',
      message: 'Parsing and validating nodes...',
      variant: 'terminal',
      timeout: 6500,
    });
    try {
      await AppService.ImportFromClipboard(importText.trim());
      await refreshData();
      setImportText('');
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 5000 - elapsed);
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }
      loading.hide();
    } catch (err: any) {
      loading.hide();
      const msg = err?.message || 'Failed to parse configurations';
      setImportError(msg);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subUrl.trim()) return;
    setSubLoading(true);
    setSubError('');
    loading.show({
      title: 'Syncing Subscription',
      message: 'Fetching and decrypting remote nodes...',
      successTitle: 'Subscription Sync',
      successHighlight: 'Successful',
      successMessage: 'All subscription nodes updated and ready.',
      variant: 'sync',
    });
    try {
      await AppService.AddSubscription(subName.trim() || 'Subscription', subUrl.trim());
      await refreshData();
      await new Promise((r) => setTimeout(r, 600));
      loading.hide();
      setShowSubModal(false);
      setSubName('');
      setSubUrl('');
    } catch (err: any) {
      loading.hide();
      const msg = err?.message || 'Failed to update subscription';
      setSubError(msg);
    } finally {
      setSubLoading(false);
    }
  };

  const handleCloseUpdateModal = (dontAskAgain: boolean) => {
    if (dontAskAgain && availableUpdate) {
      localStorage.setItem('byp_skip_update_version', availableUpdate.version);
      toast.info('Notification Suppressed', `Skipping update prompts for ${availableUpdate.version}`);
    }
    setShowUpdateModal(false);
  };

  const handleUpdateNow = async () => {
    setShowUpdateModal(false);
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
      toast.error('Update Failed', err?.message || 'Failed to download update packages');
    }
  };

  const handleUpdateAllSubscriptions = async () => {
    if (updatingSubs || subscriptions.length === 0) return;
    setUpdatingSubs(true);
    toast.info('Updating Subscriptions', `Syncing ${subscriptions.length} subscription(s)...`);
    try {
      const count = await AppService.UpdateAllSubscriptions();
      await refreshData();
      toast.success('Subscriptions Updated', `Successfully updated ${count} subscription(s).`);
    } catch (err: any) {
      toast.error('Subscription Update Failed', err?.message || 'Could not update subscriptions');
    } finally {
      setUpdatingSubs(false);
    }
  };

  const handleUpdateSingleSubscription = async (sub: Subscription, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (updatingSubId) return;
    setUpdatingSubId(sub.id);
    toast.info('Updating Subscription', `Syncing "${sub.name}"...`);
    try {
      await AppService.UpdateSubscription(sub.id);
      await refreshData();
      toast.success('Subscription Updated', `"${sub.name}" updated successfully.`);
    } catch (err: any) {
      toast.error('Update Failed', err?.message || 'Failed to update subscription');
    } finally {
      setUpdatingSubId(null);
    }
  };

  const handleDeleteSubscriptionWithConfirm = async (sub: Subscription, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await confirmDialog.ask({
      title: 'Delete Subscription',
      message: `Are you sure you want to delete "${sub.name}" and all of its ${sub.profileCount || 0} nodes?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash',
    });
    if (ok) {
      try {
        await AppService.DeleteSubscription(sub.id);
        await refreshData();
        toast.success('Subscription Deleted', `Removed "${sub.name}".`);
      } catch (err: any) {
        toast.error('Delete Failed', err?.message || 'Failed to delete subscription');
      }
    }
  };

  const handlePing = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPingingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const ping = await AppService.PingProfile(id);
      if (typeof ping === 'number' && ping >= 0) {
        setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ping } : p)));
      }
    } catch (err) {
      console.error('PingProfile error:', err);
    } finally {
      setPingingMap((prev) => ({ ...prev, [id]: false }));
      refreshData();
    }
  };

  const handlePingAll = async () => {
    if (pingingAll || profiles.length === 0) return;
    setPingingAll(true);
    try {
      await AppService.PingAllProfiles();
      await refreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setPingingAll(false);
    }
  };

  const handleOpenEditModal = (p: Profile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const parsed = parseProfileToForm(p);
    setEditForm(parsed);
    setIsNewConfig(false);
    setEditTab('form');
    setEditError('');
    setShowEditModal(true);
  };

  const handleOpenCreateCustom = () => {
    let randomUuid = 'b831381d-6324-4d53-ad4f-8cda48b30811';
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        randomUuid = crypto.randomUUID();
      }
    } catch (_) {}

    const initial: ConfigFormState = {
      id: `prof-${Date.now()}`,
      name: 'Custom Node',
      protocol: 'vless',
      server: '',
      port: 443,
      uuid: randomUuid,
      password: '',
      method: 'aes-256-gcm',
      flow: 'none',
      network: 'tcp',
      security: 'reality',
      serverName: '',
      path: '',
      hostHeader: '',
      fingerprint: 'chrome',
      publicKey: '',
      shortId: '',
      spiderX: '',
      rawJson: '',
    };
    initial.rawJson = JSON.stringify(buildOutboundFromForm(initial), null, 2);
    setEditForm(initial);
    setIsNewConfig(true);
    setEditTab('form');
    setEditError('');
    setShowEditModal(true);
  };

  const updateEditField = (field: keyof ConfigFormState, value: any) => {
    setEditForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (editTab === 'form') {
        try {
          const ob = buildOutboundFromForm(updated);
          updated.rawJson = JSON.stringify(ob, null, 2);
        } catch (_) {}
      }
      return updated;
    });
  };

  const formatEditJson = () => {
    try {
      const parsed = JSON.parse(editForm.rawJson);
      setEditForm((prev) => ({
        ...prev,
        rawJson: JSON.stringify(parsed, null, 2),
      }));
      setEditError('');
    } catch (err: any) {
      setEditError(`Invalid JSON: ${err?.message || 'Syntax error'}`);
    }
  };

  const handleSaveProfile = async () => {
    setEditError('');
    let outboundObj: any = null;

    if (editTab === 'json') {
      try {
        outboundObj = JSON.parse(editForm.rawJson);
      } catch (err: any) {
        setEditError(`Invalid JSON: ${err?.message || 'Syntax error'}`);
        return;
      }
    } else {
      if (!editForm.server.trim()) {
        setEditError('Server address is required');
        return;
      }
      if (!editForm.port || editForm.port < 1 || editForm.port > 65535) {
        setEditError('Please enter a valid port between 1 and 65535');
        return;
      }
      if (editForm.protocol === 'vless' && !editForm.uuid.trim()) {
        setEditError('User UUID is required for VLESS');
        return;
      }
      if (editForm.protocol === 'vmess' && !editForm.uuid.trim()) {
        setEditError('User UUID is required for VMess');
        return;
      }
      if (editForm.protocol === 'trojan' && !editForm.password.trim() && !editForm.uuid.trim()) {
        setEditError('Password or UUID is required for Trojan');
        return;
      }
      if (editForm.protocol === 'shadowsocks' && !editForm.password.trim()) {
        setEditError('Password is required for Shadowsocks');
        return;
      }

      outboundObj = buildOutboundFromForm(editForm);
    }

    setEditSaving(true);
    try {
      const protocol = (outboundObj.protocol || editForm.protocol || 'vless').toLowerCase();
      let server = editForm.server;
      let port = Number(editForm.port);
      const tag = (editForm.name && editForm.name.trim()) || outboundObj.tag || `${protocol}-node`;
      outboundObj.tag = tag;

      if (outboundObj.settings?.vnext?.[0]) {
        server = outboundObj.settings.vnext[0].address || server;
        port = outboundObj.settings.vnext[0].port || port;
      } else if (outboundObj.settings?.servers?.[0]) {
        server = outboundObj.settings.servers[0].address || server;
        port = outboundObj.settings.servers[0].port || port;
      }

      const existing = profiles.find((p) => p.id === editForm.id);
      const updatedProfile: Profile = {
        id: editForm.id || `prof-${Date.now()}`,
        name: tag,
        protocol: protocol,
        server: server,
        port: port,
        rawLink: existing?.rawLink || '',
        outboundJson: JSON.stringify(outboundObj),
        ping: existing?.ping ?? -1,
        subscriptionId: existing?.subscriptionId,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      await AppService.UpdateProfile(updatedProfile);
      await refreshData();
      setShowEditModal(false);
      toast.success(
        isNewConfig ? 'Configuration Created' : 'Configuration Updated',
        `"${updatedProfile.name}" (${updatedProfile.protocol.toUpperCase()}) saved successfully.`
      );
    } catch (err: any) {
      setEditError(err?.message || 'Failed to save configuration');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteProfile = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = profiles.find((p) => p.id === id);
    const ok = await confirmDialog.ask({
      title: 'Delete Configuration',
      message: `Are you sure you want to delete "${target?.name || 'this configuration'}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash',
    });
    if (ok) {
      await AppService.DeleteProfile(id);
      if (selectedProfileId === id) {
        setSelectedProfileId('');
      }
      refreshData();
    }
  };

  const handleClearAllProfiles = async () => {
    if (profiles.length === 0) return;
    const ok = await confirmDialog.ask({
      title: 'Delete All Configs',
      message: `Are you sure you want to remove all ${profiles.length} configurations? This action cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash',
    });
    if (ok) {
      for (const p of profiles) {
        try {
          await AppService.DeleteProfile(p.id);
        } catch (_) {}
      }
      setSelectedProfileId('');
      await refreshData();
    }
  };

  const handleDeleteSubscription = async (sub: Subscription) => {
    const ok = await confirmDialog.ask({
      title: 'Delete Subscription',
      message: `Delete subscription "${sub.name}" and remove all related proxy nodes?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash',
    });
    if (ok) {
      await AppService.DeleteSubscription(sub.id);
      await refreshData();
    }
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      return (
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.protocol.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [profiles, searchQuery]);

  const manualProfiles = useMemo(() => {
    return filteredProfiles.filter((p) => !p.subscriptionId);
  }, [filteredProfiles]);

  const activeProfile = useMemo(() => {
    const targetId = connected ? activeProfileId : selectedProfileId;
    return profiles.find((p) => p.id === targetId) || profiles[0];
  }, [connected, activeProfileId, selectedProfileId, profiles]);

  return (
    <div className="flex h-screen w-screen bg-[#111216] text-white overflow-hidden font-sans select-none antialiased">
      {/* Sidebar Dock Rail */}
      <Sidebar
        selectedTab={selectedTab}
        setSelectedTab={setSelectedTab}
        connected={connected}
        mode={mode}
        onResetNetwork={handleResetNetwork}
        onModeChange={handleModeChange}
      />

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[#111216] relative">
        <TitleBar />

        <main className="flex-1 flex flex-col bg-[#111216] overflow-hidden min-w-0 relative">
          <AnimatePresence mode="wait">
            {selectedTab === 'connect' && (
              <ConnectTab
                key="connect"
                connected={connected}
                mode={mode}
                sessionSeconds={sessionSeconds}
                activeProfile={activeProfile}
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                showQuickPicker={showQuickPicker}
                setShowQuickPicker={setShowQuickPicker}
                onToggleConnect={handleToggleConnect}
                onModeChange={handleModeChange}
                onSelectTab={setSelectedTab}
                onPing={handlePing}
                pingingMap={pingingMap}
                onSelectProfile={(id) => {
                  setSelectedProfileId(id);
                  setShowQuickPicker(false);
                  if (connected) {
                    AppService.Connect(id, mode);
                  }
                }}
              />
            )}

            {selectedTab === 'configs' && (
              <ConfigsTab
                key="configs"
                configViewMode={configViewMode}
                setConfigViewMode={setConfigViewMode}
                profiles={profiles}
                subscriptions={subscriptions}
                manualProfiles={manualProfiles}
                filteredProfiles={filteredProfiles}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                updatingSubs={updatingSubs}
                updatingSubId={updatingSubId}
                pingingMap={pingingMap}
                pingingAll={pingingAll}
                connected={connected}
                activeProfileId={activeProfileId}
                selectedProfileId={selectedProfileId}
                setSelectedProfileId={setSelectedProfileId}
                onPing={handlePing}
                onPingAll={handlePingAll}
                onDeleteProfile={handleDeleteProfile}
                onClearAllProfiles={handleClearAllProfiles}
                onOpenEditModal={handleOpenEditModal}
                onImportClipboardDirect={handleImportClipboardDirect}
                onOpenCreateCustom={handleOpenCreateCustom}
                onOpenSubModal={() => setShowSubModal(true)}
                onUpdateSingleSubscription={handleUpdateSingleSubscription}
                onDeleteSubscriptionWithConfirm={handleDeleteSubscriptionWithConfirm}
                onUpdateAllSubscriptions={handleUpdateAllSubscriptions}
              />
            )}

            {selectedTab === 'split' && (
              <SplitTab
                key="split"
                settings={settings}
                systemGateway={systemGateway}
                appRoutes={appRoutes}
                mode={mode}
                onSwitchToTun={() => handleModeChange('tun')}
                applyVisualRouting={applyVisualRouting}
                onSelectExe={handleSelectExe}
                onOpenRunningApps={handleOpenRunningApps}
                onAddPreset={handleAddPreset}
                onClearAllApps={handleClearAllApps}
              />
            )}

            {selectedTab === 'socks' && (
              <SocksTab
                key="socks"
                mode={mode}
                settings={settings}
                setSettings={setSettings}
                onModeChange={handleModeChange}
                onResetNetwork={handleResetNetwork}
              />
            )}

            {selectedTab === 'app_settings' && (
              <SettingsTab
                key="app_settings"
                settings={settings}
                coreVersion={coreVersion}
                dnsProvider={dnsProvider}
                primaryDns={primaryDns}
                secondaryDns={secondaryDns}
                setDnsProvider={setDnsProvider}
                setPrimaryDns={setPrimaryDns}
                setSecondaryDns={setSecondaryDns}
                onToggleAutoStart={handleToggleAutoStart}
                onToggleAutoConnect={handleToggleAutoConnect}
                onSelectDnsPreset={handleSelectDnsPreset}
                onSaveCustomDns={handleSaveCustomDns}
              />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Dialogs and Overlays */}
      <SubscriptionModal
        show={showSubModal}
        onClose={() => setShowSubModal(false)}
        subscriptions={subscriptions}
        subName={subName}
        setSubName={setSubName}
        subUrl={subUrl}
        setSubUrl={setSubUrl}
        subLoading={subLoading}
        subError={subError}
        onAddSubscription={handleAddSubscription}
        onDeleteSubscription={handleDeleteSubscription}
      />

      <ImportModal
        show={showImportModal}
        onClose={() => setShowImportModal(false)}
        importText={importText}
        setImportText={setImportText}
        importError={importError}
        importLoading={importLoading}
        onImportManual={handleImportManual}
        onOpenCreateCustom={handleOpenCreateCustom}
      />

      <ConfigEditModal
        show={showEditModal}
        onClose={() => setShowEditModal(false)}
        isNewConfig={isNewConfig}
        editTab={editTab}
        setEditTab={setEditTab}
        editForm={editForm}
        setEditForm={setEditForm}
        updateEditField={updateEditField}
        editSaving={editSaving}
        editError={editError}
        formatEditJson={formatEditJson}
        onSaveProfile={handleSaveProfile}
      />

      <RunningAppsModal
        show={showRunningAppsModal}
        onClose={() => setShowRunningAppsModal(false)}
        runningApps={runningApps}
        runningAppsLoading={runningAppsLoading}
        filteredRunningApps={filteredRunningApps}
        appSearchQuery={appSearchQuery}
        setAppSearchQuery={setAppSearchQuery}
        settings={settings}
        onAddRunningApp={handleAddRunningApp}
      />

      <UpdatePromptModal
        show={showUpdateModal}
        updateInfo={availableUpdate}
        onClose={handleCloseUpdateModal}
        onUpdateNow={handleUpdateNow}
      />

      <Toaster />
      <LoadingOverlay />
      <ConfirmModal />
    </div>
  );
}
