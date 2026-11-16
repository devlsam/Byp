package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/updater"

	"changeme/internal/storage"
)


const updateCheckUnit = time.Hour 

  

  

func isUpdaterBusyOrReady(s updater.State) bool {
	switch s {
	case updater.StateChecking, updater.StateDownloading, updater.StateVerifying, updater.StateInstalling, updater.StateReady:
		return true
	default:
		return false
	}
}

// syncPeriodicUpdateChecker starts, updates the interval of, or stops the background update check loop.
func (a *AppService) syncPeriodicUpdateChecker(enabled bool, hours int) {
	a.updaterMu.Lock()
	defer a.updaterMu.Unlock()

	if !enabled {
		if a.updaterCancel != nil {
			a.updaterCancel()
			a.updaterCancel = nil
		}
		a.updaterHours = 0
		return
	}

	normalizedHours := storage.NormalizeUpdateCheckHours(hours)
	if a.updaterCancel != nil && a.updaterHours == normalizedHours {
		return
	}

	if a.updaterCancel != nil {
		a.updaterCancel()
		a.updaterCancel = nil
	}

	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	a.updaterCancel = cancel
	a.updaterHours = normalizedHours
	go a.periodicUpdateLoop(ctx, time.Duration(normalizedHours)*updateCheckUnit)
}

func (a *AppService) periodicUpdateLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if a.app == nil || a.app.Updater == nil || isUpdaterBusyOrReady(a.app.Updater.State()) {
				continue
			}
			err := a.app.Updater.CheckAndInstall(ctx)
			log.Printf("[Updater] periodic CheckAndInstall complete (err=%v)", err)
		}
	}
}

// CheckForUpdates queries GitHub Releases for newer releases.
func (a *AppService) CheckForUpdates() (*UpdateInfo, error) {
	if a.app == nil || a.app.Updater == nil {
		return nil, fmt.Errorf("updater not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	rel, err := a.app.Updater.Check(ctx)
	if err != nil {
		return nil, fmt.Errorf("check for updates failed: %w", err)
	}

	currentVer := a.app.Updater.CurrentVersion()
	if rel == nil {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: currentVer,
		}, nil
	}

	return &UpdateInfo{
		Available:      true,
		Version:        rel.Version,
		Name:           rel.Name,
		Notes:          rel.Notes,
		PublishedAt:    rel.PublishedAt.Format("2006-01-02 15:04"),
		CurrentVersion: currentVer,
	}, nil
}

// DownloadAndInstallUpdate downloads the latest release artifact from GitHub and installs it.
func (a *AppService) DownloadAndInstallUpdate() error {
	if a.app == nil || a.app.Updater == nil {
		return fmt.Errorf("updater not initialized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	if err := a.app.Updater.DownloadAndInstall(ctx); err != nil {
		return fmt.Errorf("download/install failed: %w", err)
	}
	return nil
}

// RestartApp gracefully closes connections and restarts into the updated version.
func (a *AppService) RestartApp() error {
	if a.app == nil || a.app.Updater == nil {
		return fmt.Errorf("updater not initialized")
	}
	_ = a.Disconnect()
	return a.app.Updater.Restart(context.Background())
}

// GetAppVersion returns the active application version.
func (a *AppService) GetAppVersion() string {
	if a.app != nil && a.app.Updater != nil {
		v := a.app.Updater.CurrentVersion()
		if v != "" {
			return v
		}
	}
	return AppVersion
}
