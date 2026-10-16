package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"changeme/internal/core"
	"changeme/internal/storage"
)

// GetProfiles returns all configured profiles.
func (a *AppService) GetProfiles() []storage.Profile {
	return a.store.GetProfiles()
}

// GetSubscriptions returns all subscriptions.
func (a *AppService) GetSubscriptions() []storage.Subscription {
	return a.store.GetSubscriptions()
}

// ImportFromClipboard parses one or more share links from text into stored profiles.
func (a *AppService) ImportFromClipboard(content string) (int, error) {
	profiles, err := a.xrayMgr.ParseShareLinks(content)
	if err != nil {
		a.log("Failed to parse links from clipboard: %v", err)
		return 0, err
	}

	if err := a.store.AddProfiles(profiles); err != nil {
		return 0, err
	}

	a.log("Successfully imported %d profile(s)", len(profiles))
	return len(profiles), nil
}

// AddSubscription downloads remote subscription configurations and saves the extracted profiles.
func (a *AppService) AddSubscription(name string, subURL string) error {
	a.log("Fetching subscription from %s...", subURL)

	req, err := http.NewRequest("GET", subURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "v2rayN/6.23")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		a.log("Subscription request failed: %v", err)
		return err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	profiles, err := a.xrayMgr.ParseShareLinks(string(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to parse subscription profiles: %w", err)
	}

	subID := fmt.Sprintf("sub-%d", time.Now().UnixNano())
	for i := range profiles {
		profiles[i].SubscriptionID = subID
	}

	sub := storage.Subscription{
		ID:           subID,
		Name:         name,
		URL:          subURL,
		ProfileCount: len(profiles),
		UpdatedAt:    time.Now(),
	}

	if err := a.store.SaveSubscription(sub); err != nil {
		return err
	}
	if err := a.store.AddProfiles(profiles); err != nil {
		return err
	}

	a.log("Added subscription '%s' with %d profile(s)", name, len(profiles))
	return nil
}

// UpdateSubscription refreshes an existing subscription by ID.
func (a *AppService) UpdateSubscription(subID string) error {
	subs := a.store.GetSubscriptions()
	var target *storage.Subscription
	for _, s := range subs {
		if s.ID == subID {
			target = &s
			break
		}
	}
	if target == nil {
		return fmt.Errorf("subscription not found: %s", subID)
	}

	a.log("Updating subscription '%s' from %s...", target.Name, target.URL)

	req, err := http.NewRequest("GET", target.URL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "v2rayN/6.23")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		a.log("Subscription request failed: %v", err)
		return err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	profiles, err := a.xrayMgr.ParseShareLinks(string(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to parse subscription profiles: %w", err)
	}

	_ = a.store.DeleteProfilesBySubscription(subID)

	for i := range profiles {
		profiles[i].SubscriptionID = subID
	}

	target.ProfileCount = len(profiles)
	target.UpdatedAt = time.Now()

	if err := a.store.SaveSubscription(*target); err != nil {
		return err
	}
	if err := a.store.AddProfiles(profiles); err != nil {
		return err
	}

	a.log("Updated subscription '%s' with %d profile(s)", target.Name, len(profiles))
	return nil
}

// UpdateAllSubscriptions updates all registered subscriptions sequentially.
func (a *AppService) UpdateAllSubscriptions() (int, error) {
	subs := a.store.GetSubscriptions()
	if len(subs) == 0 {
		return 0, nil
	}
	updatedCount := 0
	var lastErr error
	for _, s := range subs {
		if err := a.UpdateSubscription(s.ID); err != nil {
			a.log("Failed to update subscription %s: %v", s.Name, err)
			lastErr = err
		} else {
			updatedCount++
		}
	}
	if updatedCount == 0 && lastErr != nil {
		return 0, lastErr
	}
	return updatedCount, nil
}

// DeleteProfile removes a profile by its unique ID.
func (a *AppService) DeleteProfile(profileID string) error {
	a.mu.RLock()
	if a.connected && a.activeProfileID == profileID {
		a.mu.RUnlock()
		_ = a.Disconnect()
	} else {
		a.mu.RUnlock()
	}
	return a.store.DeleteProfile(profileID)
}

// DeleteSubscription removes a subscription and all associated profiles.
func (a *AppService) DeleteSubscription(subID string) error {
	_ = a.store.DeleteProfilesBySubscription(subID)
	return a.store.DeleteSubscription(subID)
}

// UpdateProfile updates or creates a custom profile.
func (a *AppService) UpdateProfile(profile storage.Profile) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if profile.ID == "" {
		profile.ID = fmt.Sprintf("prof-%d", time.Now().UnixNano())
		profile.CreatedAt = time.Now()
	}
	if profile.Ping == 0 {
		profile.Ping = -1
	}

	if err := a.store.SaveProfile(profile); err != nil {
		return err
	}

	a.log("Profile '%s' (%s) saved successfully", profile.Name, profile.Protocol)

	if a.connected && a.activeProfileID == profile.ID {
		a.log("Active profile updated - reloading connection...")
		settings := a.store.GetSettings()
		cfgJSON, err := core.MergeCompleteConfig(profile.OutboundJSON, core.ConfigMergerOptions{
			SocksPort: settings.SocksPort,
			HttpPort:  settings.HttpPort,
			ApiPort:   10807,
		})
		if err == nil {
			_ = a.xrayMgr.Start(cfgJSON)
		}
	}

	return nil
}

// BuildCustomProfile constructs a validated Profile object from form parameters.
func (a *AppService) BuildCustomProfile(params core.CustomOutboundParams) (storage.Profile, error) {
	ob, err := core.BuildOutboundFromParams(params)
	if err != nil {
		return storage.Profile{}, err
	}

	obBytes, err := json.Marshal(ob)
	if err != nil {
		return storage.Profile{}, err
	}

	now := time.Now()
	tag := params.Name
	if tag == "" {
		tag = fmt.Sprintf("%s-custom", params.Protocol)
	}

	return storage.Profile{
		ID:           fmt.Sprintf("prof-%d", now.UnixNano()),
		Name:         tag,
		Protocol:     params.Protocol,
		Server:       params.Server,
		Port:         params.Port,
		RawLink:      "",
		OutboundJSON: string(obBytes),
		Ping:         -1,
		CreatedAt:    now,
	}, nil
}
