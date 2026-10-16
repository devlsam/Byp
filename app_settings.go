package main

import (
	"fmt"

	"changeme/internal/core"
	"changeme/internal/storage"
	"changeme/internal/tun"
)

// GetSettings returns the current app settings.
func (a *AppService) GetSettings() storage.Settings {
	return a.store.GetSettings()
}

// SaveSettings updates app settings and synchronizes autostart and split tunneling rules.
func (a *AppService) SaveSettings(settings storage.Settings) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	oldSettings := a.store.GetSettings()
	if err := a.store.UpdateSettings(settings); err != nil {
		return err
	}
	driverApps := settings.SplitDriverApps
	if len(driverApps) == 0 && settings.SplitTunnelMode != "all" {
		driverApps = settings.SplitTunnelApps
	}
	a.tunMgr.UpdateSplitConfig(settings.SplitTunnelMode, driverApps)

	if oldSettings.AutoStart != settings.AutoStart && a.app != nil && a.app.Autostart != nil {
		if settings.AutoStart {
			_ = a.app.Autostart.Enable()
		} else {
			_ = a.app.Autostart.Disable()
		}
	}

	a.log("Settings updated successfully (AutoStart=%v, DNS=%s)", settings.AutoStart, settings.PrimaryDNS)
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
