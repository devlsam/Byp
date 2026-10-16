package main

import (
	"fmt"
	"sync"

	"changeme/internal/storage"
)

// PingProfile tests latency for an individual profile.
func (a *AppService) PingProfile(profileID string) (int64, error) {
	profile := a.store.GetProfile(profileID)
	if profile == nil {
		return -1, fmt.Errorf("profile not found: %s", profileID)
	}

	settings := a.store.GetSettings()
	ping := a.xrayMgr.MeasureServerPing(profile.Server, profile.Port, "http://cp.cloudflare.com/generate_204", settings.SocksPort)
	_ = a.store.UpdateProfilePing(profileID, ping, true)

	if a.app != nil {
		a.app.Event.Emit("profile:ping", PingEvent{ID: profileID, Ping: ping})
	}
	return ping, nil
}

// PingAllProfiles tests latency for all profiles concurrently using worker batching.
func (a *AppService) PingAllProfiles() map[string]int64 {
	profiles := a.store.GetProfiles()
	results := make(map[string]int64, len(profiles))
	var wg sync.WaitGroup
	var mu sync.Mutex

	settings := a.store.GetSettings()
	sem := make(chan struct{}, 8)

	for _, p := range profiles {
		wg.Add(1)
		go func(prof storage.Profile) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ping := a.xrayMgr.MeasureServerPing(prof.Server, prof.Port, "http://cp.cloudflare.com/generate_204", settings.SocksPort)
			_ = a.store.UpdateProfilePing(prof.ID, ping, false)

			if a.app != nil {
				a.app.Event.Emit("profile:ping", PingEvent{ID: prof.ID, Ping: ping})
			}

			mu.Lock()
			results[prof.ID] = ping
			mu.Unlock()
		}(p)
	}

	wg.Wait()
	_ = a.store.Save()
	return results
}
