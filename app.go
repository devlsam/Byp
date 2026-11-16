package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"changeme/internal/core"
	"changeme/internal/storage"
	"changeme/internal/sysproxy"
	"changeme/internal/tun"
)

// AppService provides the primary backend services exposed to the Wails v3 frontend.
type AppService struct {
	ctx             context.Context
	mu              sync.RWMutex
	store           *storage.Store
	xrayMgr         *core.XrayManager
	tunMgr          *tun.TunManager
	connected       bool
	activeProfileID string
	activeMode      string
	app             *application.App
	watchCtx        context.Context
	watchCancel     context.CancelFunc
}

// NewAppService initializes a new AppService with storage and engine managers.
func NewAppService() *AppService {
	store, _ := storage.NewStore()
	return &AppService{
		store:   store,
		xrayMgr: core.NewXrayManager(),
		tunMgr:  tun.NewTunManager(),
	}
}

// ServiceStartup initializes the service upon Wails application startup.
func (a *AppService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.ctx = ctx
	a.app = application.Get()
	a.log("Application started (Wails v3)")

	// Ensure wintun.dll is available on disk before cleaning stale TUN/Zeltun state
	_ = a.tunMgr.EnsureWintunDLL()
	_ = sysproxy.ClearProxy()
	_ = a.tunMgr.CleanupStaleRoutes()

	// Apply auto-start and initial TUN options configuration
	initialSettings := a.store.GetSettings()
	a.tunMgr.SetZeltunOptions(tunOptionsFromSettings(initialSettings))
	if initialSettings.AutoStart && a.app != nil && a.app.Autostart != nil {
		_ = a.app.Autostart.Enable()
	}

	go a.listenForKillSignals()
	go a.statsLoop()
	return nil
}

// ServiceShutdown performs graceful cleanup of proxy and TUN routes upon exit.
func (a *AppService) ServiceShutdown() error {
	a.log("Shutting down - cleaning up proxies and TUN routes")
	_ = a.Disconnect()
	if a.store != nil {
		_ = a.store.Flush()
	}
	return nil
}

func (a *AppService) listenForKillSignals() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(c)

	select {
	case <-c:
		_ = sysproxy.ClearProxy()
		_ = a.tunMgr.CleanupStaleRoutes()
	case <-a.ctx.Done():
		return
	}
}

func (a *AppService) log(format string, args ...any) {
	msg := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
	if a.app != nil {
		a.app.Event.Emit("log:new", msg)
	}
}

func (a *AppService) statsLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	var lastTraffic core.TrafficStats
	var lastTunStats tun.ZeltunStats
	hasLastTun := false

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.mu.RLock()
			isConnected := a.connected
			a.mu.RUnlock()

			if !isConnected {
				lastTraffic = core.TrafficStats{}
				hasLastTun = false
				continue
			}

			// Drain native Zeltun log ring buffer into Go stdout instead of flooding WebView2 IPC.
			for _, msg := range a.tunMgr.PollZeltunLogs() {
				log.Printf("[Zeltun] %s", msg)
			}

			// Don't query gRPC or wake up WebView2 JS thread if window is hidden in tray
			if a.app != nil {
				if w, ok := a.app.Window.GetByName("main"); ok && !w.IsVisible() {
					continue
				}
			}

			if stats, err := a.xrayMgr.QueryTrafficStats(10807); err == nil && a.app != nil {
				if stats != lastTraffic {
					lastTraffic = stats
					a.app.Event.Emit("traffic:update", stats)
				}
			}
			if tunStats, ok := a.tunMgr.GetZeltunStats(); ok && a.app != nil {
				if !hasLastTun || tunStats != lastTunStats {
					lastTunStats = tunStats
					hasLastTun = true
					a.app.Event.Emit("tun:stats", tunStats)
				}
			}
		}
	}
}
