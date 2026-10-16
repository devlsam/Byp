package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"changeme/internal/core"
	"changeme/internal/storage"
)

// PingEvent represents a latency update event emitted to the frontend.
type PingEvent struct {
	ID   string `json:"id"`
	Ping int64  `json:"ping"`
}

// VpnStatusEvent represents an active connection status update event.
type VpnStatusEvent struct {
	Connected       bool   `json:"connected"`
	ActiveProfileID string `json:"activeProfileId"`
	ActiveMode      string `json:"activeMode"`
}

// AppState represents the comprehensive state of the desktop client.
type AppState struct {
	Connected       bool              `json:"connected"`
	ActiveProfileID string            `json:"activeProfileId"`
	ActiveMode      string            `json:"activeMode"`
	CoreVersion     string            `json:"coreVersion"`
	Settings        storage.Settings  `json:"settings"`
	Stats           core.TrafficStats `json:"stats"`
}

// UpdateInfo represents release details returned when checking for updates.
type UpdateInfo struct {
	Available      bool   `json:"available"`
	Version        string `json:"version"`
	Name           string `json:"name"`
	Notes          string `json:"notes"`
	PublishedAt    string `json:"publishedAt"`
	CurrentVersion string `json:"currentVersion"`
}

func init() {
	application.RegisterEvent[core.TrafficStats]("traffic:update")
	application.RegisterEvent[string]("log:new")
	application.RegisterEvent[PingEvent]("profile:ping")
	application.RegisterEvent[VpnStatusEvent]("vpn:status")
}
