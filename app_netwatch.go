package main

import (
	"context"
	"time"
)

// startNetworkWatcher monitors the physical network adapter for gateway or IP changes.
func (a *AppService) startNetworkWatcher(ctx context.Context, profileID string) {
	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()

	var lastGateway string
	var lastIP string

	if info, err := a.tunMgr.GetPhysicalAdapterInfo(); err == nil {
		lastGateway = info.Gateway
		if info.LanIP != nil {
			lastIP = info.LanIP.String()
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.mu.Lock()
			connected := a.connected
			mode := a.activeMode
			a.mu.Unlock()

			if !connected || mode != "tun" {
				return
			}

			info, err := a.tunMgr.GetPhysicalAdapterInfo()
			if err != nil || info.Gateway == "" || info.LanIP == nil || info.LanIP.IsUnspecified() {
				continue
			}

			currentIP := info.LanIP.String()
			currentGateway := info.Gateway

			if lastGateway == "" {
				lastGateway = currentGateway
				lastIP = currentIP
				continue
			}

			if currentGateway != lastGateway || currentIP != lastIP {
				a.log("Network change detected (Gateway: %s -> %s, IP: %s -> %s). Re-syncing connection...",
					lastGateway, currentGateway, lastIP, currentIP)

				lastGateway = currentGateway
				lastIP = currentIP

				a.tunMgr.UpdatePhysicalAdapter(currentGateway, info.LanIP, info.InterfaceIndex)

				profile := a.store.GetProfile(profileID)
				if profile != nil {
					if fullConfig, err := a.buildProfileConfig(profile, currentIP); err == nil {
						_ = a.xrayMgr.Start(fullConfig)
						a.log("Xray re-bound to new physical IP: %s", currentIP)
					}
				}
			}
		}
	}
}
