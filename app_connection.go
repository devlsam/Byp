package main

import (
	"fmt"
	"time"

	"changeme/internal/core"
	"changeme/internal/sysproxy"
	"changeme/internal/sysutil"
)

// Connect connects to the designated profile using the specified operating mode (tun, proxy, or core).
func (a *AppService) Connect(profileID string, mode string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	profile := a.store.GetProfile(profileID)
	if profile == nil {
		return fmt.Errorf("profile not found: %s", profileID)
	}

	settings := a.store.GetSettings()
	if mode == "" {
		mode = settings.Mode
	}
	if mode == "" {
		mode = "proxy"
	}

	a.log("Generating Xray configuration for profile '%s' (%s)", profile.Name, profile.Protocol)

	var dnsServers []string
	if settings.PrimaryDNS != "" {
		dnsServers = append(dnsServers, settings.PrimaryDNS)
	}
	if settings.SecondaryDNS != "" {
		dnsServers = append(dnsServers, settings.SecondaryDNS)
	}

	fullConfig, err := core.MergeCompleteConfig(profile.OutboundJSON, core.ConfigMergerOptions{
		SocksPort:  settings.SocksPort,
		HttpPort:   settings.HttpPort,
		ApiPort:    10807,
		DnsServers: dnsServers,
	})
	if err != nil {
		a.log("Configuration build error: %v", err)
		return fmt.Errorf("failed to build configuration: %w", err)
	}

	a.log("Starting embedded Xray instance via libxray...")
	if err := a.xrayMgr.Start(fullConfig); err != nil {
		a.log("Failed to start Xray: %v", err)
		return err
	}
	a.log("Xray core running on 127.0.0.1:%d (SOCKS) & 127.0.0.1:%d (HTTP)", settings.SocksPort, settings.HttpPort)

	switch mode {
	case "proxy":
		a.log("Setting Windows System Proxy to 127.0.0.1:%d...", settings.HttpPort)
		if err := sysproxy.SetProxy(settings.HttpPort); err != nil {
			a.log("Warning: Failed to set system proxy: %v", err)
			_ = a.xrayMgr.Stop()
			return err
		}
		a.log("Windows System Proxy activated successfully")

	case "tun":
		a.log("Activating Windows TUN Mode with DNS (%s / %s)...", settings.PrimaryDNS, settings.SecondaryDNS)
		splitApps := settings.SplitDriverApps
		if len(splitApps) == 0 && settings.SplitTunnelMode != "all" {
			splitApps = settings.SplitTunnelApps
		}
		if err := a.tunMgr.Start(profile.Server, settings.SocksPort, settings.SplitTunnelMode, splitApps, settings.PrimaryDNS, settings.SecondaryDNS); err != nil {
			a.log("Failed to activate TUN mode: %v", err)
			_ = a.xrayMgr.Stop()
			return fmt.Errorf("TUN mode failed (run as Administrator): %w", err)
		}
		a.log("Windows TUN Mode activated successfully")

	case "core":
		a.log("Core Only mode active: SOCKS5 127.0.0.1:%d, HTTP 127.0.0.1:%d", settings.SocksPort, settings.HttpPort)
	}

	a.connected = true
	a.activeProfileID = profileID
	a.activeMode = mode

	settings.SelectedProfileID = profileID
	settings.Mode = mode
	_ = a.store.UpdateSettings(settings)

	if a.app != nil {
		a.app.Event.Emit("vpn:status", VpnStatusEvent{
			Connected:       true,
			ActiveProfileID: profileID,
			ActiveMode:      mode,
		})
	}

	go func() {
		time.Sleep(1 * time.Second)
		ping := a.xrayMgr.MeasureServerPing(profile.Server, profile.Port, "http://cp.cloudflare.com/generate_204", settings.SocksPort)
		if ping > 0 {
			_ = a.store.UpdateProfilePing(profileID, ping, true)
			a.log("Connection latency: %d ms", ping)
			if a.app != nil {
				a.app.Event.Emit("profile:ping", PingEvent{ID: profileID, Ping: ping})
			}
		}
	}()

	return nil
}

// Disconnect stops active proxy/TUN routing and terminates the embedded core engine.
func (a *AppService) Disconnect() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.connected && !a.xrayMgr.IsRunning() && !a.tunMgr.IsRunning() {
		return nil
	}

	a.log("Disconnecting...")

	_ = sysproxy.ClearProxy()
	_ = a.tunMgr.Stop()
	_ = a.xrayMgr.Stop()

	a.connected = false
	a.activeProfileID = ""
	a.log("Disconnected successfully")

	if a.app != nil {
		a.app.Event.Emit("vpn:status", VpnStatusEvent{
			Connected:       false,
			ActiveProfileID: "",
			ActiveMode:      a.activeMode,
		})
		a.app.Event.Emit("traffic:update", core.TrafficStats{})
	}

	sysutil.TrimProcessMemory()
	return nil
}

// ResetNetwork clears Windows system proxy settings, flushes virtual TUN routes, and stops core engines.
func (a *AppService) ResetNetwork() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.log("Resetting network: clearing system proxy and routing table...")

	_ = sysproxy.ClearProxy()
	_ = a.tunMgr.CleanupStaleRoutes()
	_ = a.tunMgr.Stop()
	_ = a.xrayMgr.Stop()

	a.connected = false
	a.activeProfileID = ""

	if a.app != nil {
		a.app.Event.Emit("vpn:status", VpnStatusEvent{
			Connected:       false,
			ActiveProfileID: "",
			ActiveMode:      a.activeMode,
		})
		a.app.Event.Emit("traffic:update", core.TrafficStats{})
	}
	a.log("Network settings reset to clean direct connection")
	return nil
}

// ConnectDefault connects using the selected profile or the first available profile in storage.
func (a *AppService) ConnectDefault() error {
	a.mu.Lock()
	if a.connected {
		a.mu.Unlock()
		return nil
	}
	settings := a.store.GetSettings()
	targetID := settings.SelectedProfileID
	if targetID == "" {
		profiles := a.store.GetProfiles()
		if len(profiles) > 0 {
			targetID = profiles[0].ID
		}
	}
	a.mu.Unlock()

	if targetID == "" {
		return fmt.Errorf("no profile available to connect")
	}

	mode := settings.Mode
	if mode == "" {
		mode = "tun"
	}
	return a.Connect(targetID, mode)
}
