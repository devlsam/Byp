package main

import (
	"embed"
	"log"
	"net"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"

	"changeme/internal/sysutil"
	"changeme/internal/tun"
)

//go:embed all:frontend/dist
var assets embed.FS

// AppVersion is the version of the application, dynamic via ldflags during release build
var AppVersion = "0.9.0"

//go:embed build/appicon.png
var appIcon []byte

func main() {
	// 1. Immediately ensure embedded wintun.dll is available and loaded into Windows DLL search paths
	_ = tun.EnsureWintunDLL()

	// 2. Configure runtime memory tuning
	debug.SetMemoryLimit(160 * 1024 * 1024)
	debug.SetGCPercent(80)

	appService := NewAppService()

	var mainWindow *application.WebviewWindow

	// 3. Configure Single-Instance / Anti-Duplicate: prevents running multiple concurrent instances
	app := application.New(application.Options{
		Name:        "BYP Client",
		Description: "Production V2Ray/VPN Desktop Client",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(appService),
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.byp.client.single-instance",
			ExitCode: 0,
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				if mainWindow != nil {
					mainWindow.Show()
					mainWindow.Restore()
					mainWindow.Focus()
				}
			},
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	// Custom HTTP client for updater: No blanket timeout on body streaming to prevent
	// premature cancellation when downloading large binaries (~44MB) on standard connections.
	updaterHTTPClient := &http.Client{
		Timeout: 0,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   20 * time.Second,
			ResponseHeaderTimeout: 60 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}

	// Configure Auto-Updater backed by GitHub Releases public API
	ghProvider, err := github.New(github.Config{
		Repository: "devlsam/Beep-client",
		Prerelease: false,
		HTTPClient: updaterHTTPClient,
	})
	if err == nil {
		_ = app.Updater.Init(updater.Config{
			CurrentVersion: AppVersion,
			Providers:      []updater.Provider{ghProvider},
			CheckInterval:  4 * time.Hour,
		})
	} else {
		log.Printf("Failed to initialize GitHub updater: %v", err)
	}

	mainWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "BYP Client",
		Width:            420,
		Height:           660,
		MinWidth:         420,
		MinHeight:        660,
		MaxWidth:         420,
		MaxHeight:        660,
		Frameless:        true,
		DisableResize:    true,
		BackgroundColour: application.NewRGB(15, 17, 21),
		URL:              "/",
	})

	// Hide window to system tray when user attempts to close
	mainWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		mainWindow.Hide()
		sysutil.TrimProcessMemory()
	})

	// Reclaim memory pages when window is hidden
	mainWindow.OnWindowEvent(events.Common.WindowHide, func(e *application.WindowEvent) {
		sysutil.TrimProcessMemory()
	})

	// Setup System Tray
	systemTray := app.SystemTray.New()
	systemTray.SetIcon(appIcon)
	systemTray.SetTooltip("BYP Client")

	trayMenu := app.NewMenu()
	trayMenu.Add("Show BYP Client").OnClick(func(ctx *application.Context) {
		mainWindow.Show()
		mainWindow.Focus()
	})
	trayMenu.Add("Performance Mode").OnClick(func(ctx *application.Context) {
		mainWindow.Hide()
		sysutil.TrimProcessMemory()
	})
	trayMenu.AddSeparator()
	trayMenu.Add("Connect").OnClick(func(ctx *application.Context) {
		_ = appService.ConnectDefault()
	})
	trayMenu.Add("Disconnect").OnClick(func(ctx *application.Context) {
		_ = appService.Disconnect()
	})
	trayMenu.AddSeparator()
	trayMenu.Add("Reset Network").OnClick(func(ctx *application.Context) {
		_ = appService.ResetNetwork()
	})
	trayMenu.AddSeparator()
	trayMenu.Add("Quit").OnClick(func(ctx *application.Context) {
		_ = appService.Disconnect()
		app.Quit()
	})

	systemTray.SetMenu(trayMenu)

	// Left click on tray icon toggles Show / Hide
	systemTray.OnClick(func() {
		if mainWindow.IsVisible() {
			mainWindow.Hide()
			sysutil.TrimProcessMemory()
		} else {
			mainWindow.Show()
			mainWindow.Focus()
		}
	})

	systemTray.OnDoubleClick(func() {
		mainWindow.Show()
		mainWindow.Focus()
	})

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
