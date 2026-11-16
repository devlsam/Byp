package main

import (
	"fmt"
	"slices"

	"changeme/internal/core"
	"changeme/internal/storage"
	"changeme/internal/tun"
)

// GetSettings returns the current app settings.
func (a *AppService) GetSettings() storage.Settings {
	return a.store.GetSettings()
}

// tunOptionsFromSettings maps persisted storage.Settings into typed tun.ZeltunOptions.
func tunOptionsFromSettings(s storage.Settings) tun.ZeltunOptions {
	engine := s.TunEngine
	if engine != tun.EngineTun2Socks && engine != tun.EngineZeltun {
		engine = tun.EngineZeltun
	}
	return tun.ZeltunOptions{
		Engine:         engine,
		MTU:            s.TunMTU,
		BlockQuic:      s.ZeltunBlockQuic,
		MssClamp:       s.ZeltunMssClamp,
		TcpMss:         s.ZeltunTcpMss,
		SniSniff:       s.ZeltunSniSniff,
		BypassLan:      s.ZeltunBypassLan,
		GamingQos:      s.ZeltunGamingQos,
		CleanDns:       s.ZeltunCleanDns,
		StrictAntiLeak: s.ZeltunStrictLeak,
		EnableNrpt:     s.ZeltunEnableNrpt,
		BlockIpv6:      s.ZeltunBlockIpv6,
		UdpTimeoutSec:  s.ZeltunUdpTimeoutSec,
		RingMB:         s.ZeltunRingMB,
	}.Normalize()
}

// effectiveSplitDriverApps resolves the active driver rule list while preserving
// explicit empty lists managed by the visual flow router (e.g. whitelist with 0 VPN apps).
func effectiveSplitDriverApps(s storage.Settings) []string {
	if s.SplitTunnelMode == "all" {
		return nil
	}
	if len(s.SplitDriverApps) > 0 {
		return s.SplitDriverApps
	}
	if s.SplitAppRoutes != "" || s.SplitSystemGateway != "" {
		return nil
	}
	return s.SplitTunnelApps
}

// GetTunStats returns live extended statistics from the active native Zeltun TUN core.
func (a *AppService) GetTunStats() tun.ZeltunStats {
	st, ok := a.tunMgr.GetZeltunStats()
	if !ok {
		return tun.ZeltunStats{}
	}
	return st
}

// SaveSettings updates app settings and synchronizes autostart, DNS, Zeltun options, and split rules.
func (a *AppService) SaveSettings(settings storage.Settings) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	settings.TunConfigured = true
	settings.TunConfigVersion = 2
	settings.AutoCheckUpdatesConfigured = true
	settings.AutoCheckUpdateHours = storage.NormalizeUpdateCheckHours(settings.AutoCheckUpdateHours)
	oldSettings := a.store.GetSettings()
	upHost, upPort := normalizedUpstream(settings)
	settings.UpstreamHost = upHost
	settings.UpstreamPort = upPort

	upstreamChanged := oldSettings.UpstreamHost != settings.UpstreamHost || oldSettings.UpstreamPort != settings.UpstreamPort
	if a.connected && a.activeMode == "upstream" && upstreamChanged {
		probe := tun.TestUpstreamProxy(upHost, upPort)
		if !probe.Reachable || !probe.SocksReady {
			return fmt.Errorf("upstream proxy %s:%d check failed: %s", upHost, upPort, probe.Message)
		}
	}

	if err := a.store.UpdateSettings(settings); err != nil {
		return err
	}

	driverApps := effectiveSplitDriverApps(settings)
	oldDriverApps := effectiveSplitDriverApps(oldSettings)
	if oldSettings.SplitTunnelMode != settings.SplitTunnelMode || !slices.Equal(oldDriverApps, driverApps) {
		a.tunMgr.UpdateSplitConfig(settings.SplitTunnelMode, driverApps)
	}

	opts := tunOptionsFromSettings(settings)
	if tunOptionsFromSettings(oldSettings) != opts {
		a.tunMgr.SetZeltunOptions(opts)
	}

	dnsChanged := oldSettings.PrimaryDNS != settings.PrimaryDNS ||
		oldSettings.SecondaryDNS != settings.SecondaryDNS ||
		oldSettings.ZeltunEnableNrpt != settings.ZeltunEnableNrpt
	if dnsChanged {
		a.tunMgr.UpdateDNS(settings.PrimaryDNS, settings.SecondaryDNS)
	}

	// Reload TUN adapter seamlessly if engine choice, MTU, ring buffer, or upstream endpoint changed while connected.
	tunStructuralChange := oldSettings.TunEngine != settings.TunEngine ||
		oldSettings.TunMTU != settings.TunMTU ||
		oldSettings.ZeltunRingMB != settings.ZeltunRingMB ||
		(a.activeMode == "upstream" && upstreamChanged)
	if a.connected && isTunMode(a.activeMode) && tunStructuralChange && a.tunMgr.IsRunning() {
		a.log("TUN structural settings changed (%s, MTU=%d); hot-reloading TUN adapter...", opts.Engine, opts.MTU)
		_ = a.tunMgr.Stop()
		socksHost, socksPort := "127.0.0.1", settings.SocksPort
		serverHost := ""
		if a.activeMode == "upstream" {
			socksHost, socksPort = upHost, upPort
		} else if p := a.store.GetProfile(a.activeProfileID); p != nil {
			serverHost = p.Server
		}
		if err := a.tunMgr.StartWithUpstream(serverHost, socksHost, socksPort, settings.SplitTunnelMode, driverApps, settings.PrimaryDNS, settings.SecondaryDNS); err != nil {
			a.log("Warning: failed to reload TUN adapter: %v", err)
		}
	}

	if oldSettings.AutoStart != settings.AutoStart && a.app != nil && a.app.Autostart != nil {
		if settings.AutoStart {
			_ = a.app.Autostart.Enable()
		} else {
			_ = a.app.Autostart.Disable()
		}
	}

	if oldSettings.AutoCheckUpdates != settings.AutoCheckUpdates ||
		oldSettings.AutoCheckUpdateHours != settings.AutoCheckUpdateHours {
		a.syncPeriodicUpdateChecker(settings.AutoCheckUpdates, settings.AutoCheckUpdateHours)
	}

	a.log("Settings updated (Engine=%s, AutoStart=%v, AutoCheckUpdates=%v/%dh, DNS=%s)", opts.Engine, settings.AutoStart, settings.AutoCheckUpdates, settings.AutoCheckUpdateHours, settings.PrimaryDNS)
	return nil
}

// SetAutoStart configures whether the client starts on Windows boot.
func (a *AppService) SetAutoStart(enable bool) error {
	settings := a.store.GetSettings()
	settings.AutoStart = enable
	return a.SaveSettings(settings)
}

// GetConfigJSON returns the formatted Xray JSON configuration for inspection.
func (a *AppService) GetConfigJSON(profileID string) (string, error) {
	profile := a.store.GetProfile(profileID)
	if profile == nil {
		return "", fmt.Errorf("profile not found: %s", profileID)
	}

	settings := a.store.GetSettings()
	return core.MergeCompleteConfig(profile.OutboundJSON, core.ConfigMergerOptions{
		SocksPort: settings.SocksPort,
		HttpPort:  settings.HttpPort,
		ApiPort:   10807,
	})
}

// GetRunningApps lists active user-facing applications for Split Tunneling selection.
func (a *AppService) GetRunningApps() ([]tun.ProcessAppInfo, error) {
	return tun.GetRunningProcesses()
}

// SelectAppExecutable opens a native Windows file dialog to choose an application executable.
func (a *AppService) SelectAppExecutable() (string, error) {
	if a.app == nil || a.app.Dialog == nil {
		return "", fmt.Errorf("dialog manager not available")
	}
	dialog := a.app.Dialog.OpenFile()
	dialog.SetTitle("Select Application Executable (.exe)")
	dialog.AddFilter("Applications (*.exe)", "*.exe")
	return dialog.PromptForSingleSelection()
}

// SaveSplitTunnelConfig saves split tunneling mode and per-app routing rules.
func (a *AppService) SaveSplitTunnelConfig(mode string, apps []string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	settings := a.store.GetSettings()
	settings.SplitTunnelMode = mode
	settings.SplitDriverApps = apps
	if len(settings.SplitTunnelApps) == 0 && len(apps) > 0 {
		settings.SplitTunnelApps = apps
	}
	if err := a.store.UpdateSettings(settings); err != nil {
		return err
	}

	a.tunMgr.UpdateSplitConfig(mode, apps)
	a.log("Split Tunneling updated: mode=%s, %d active app(s) configured", mode, len(apps))
	return nil
}
