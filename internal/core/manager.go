package core

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/xtls/libxray/xray"
	statscommand "github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// XrayManager manages the lifecycle and runtime monitoring of the embedded Xray-core instance.
type XrayManager struct {
	mu            sync.Mutex
	lastUplink    int64
	lastDownlink  int64
	lastStatsTime time.Time
	baseUplink    int64
	baseDownlink  int64
	grpcConn      *grpc.ClientConn
	statsClient   statscommand.StatsServiceClient
}

// NewXrayManager creates a new XrayManager instance.
func NewXrayManager() *XrayManager {
	return &XrayManager{
		lastStatsTime: time.Now(),
	}
}

// Start launches the embedded Xray instance using the provided configuration JSON.
func (m *XrayManager) Start(configJSON string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.grpcConn != nil {
		_ = m.grpcConn.Close()
		m.grpcConn = nil
		m.statsClient = nil
	}

	if xray.GetXrayState() {
		_ = xray.StopXray()
	}

	if err := xray.RunXray(configJSON); err != nil {
		return fmt.Errorf("failed to run xray core: %w", err)
	}

	m.lastUplink = 0
	m.lastDownlink = 0
	m.baseUplink = 0
	m.baseDownlink = 0
	m.lastStatsTime = time.Now()

	return nil
}

// Stop gracefully shuts down the running embedded Xray instance.
func (m *XrayManager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.grpcConn != nil {
		_ = m.grpcConn.Close()
		m.grpcConn = nil
		m.statsClient = nil
	}

	if !xray.GetXrayState() {
		return nil
	}

	return xray.StopXray()
}

// IsRunning reports whether the embedded Xray instance is currently running.
func (m *XrayManager) IsRunning() bool {
	return xray.GetXrayState()
}

// Version returns the active Xray-core engine version.
func (m *XrayManager) Version() string {
	return xray.XrayVersion()
}

// QueryTrafficStats queries the internal gRPC StatsService for upload/download speeds and totals.
func (m *XrayManager) QueryTrafficStats(apiPort int) (TrafficStats, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !xray.GetXrayState() {
		return TrafficStats{}, nil
	}

	if m.grpcConn == nil || m.statsClient == nil {
		target := fmt.Sprintf("127.0.0.1:%d", apiPort)
		conn, err := grpc.NewClient(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			return TrafficStats{}, err
		}
		m.grpcConn = conn
		m.statsClient = statscommand.NewStatsServiceClient(conn)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()

	resp, err := m.statsClient.QueryStats(ctx, &statscommand.QueryStatsRequest{
		Pattern: "",
		Reset_:  false,
	})
	if err != nil {
		if m.grpcConn != nil {
			_ = m.grpcConn.Close()
			m.grpcConn = nil
			m.statsClient = nil
		}
		return TrafficStats{}, err
	}

	var currentUplink, currentDownlink int64
	for _, stat := range resp.Stat {
		if strings.HasSuffix(stat.Name, "traffic>>>uplink") {
			currentUplink += stat.Value
		} else if strings.HasSuffix(stat.Name, "traffic>>>downlink") {
			currentDownlink += stat.Value
		}
	}

	now := time.Now()
	elapsed := now.Sub(m.lastStatsTime).Seconds()
	if elapsed <= 0 {
		elapsed = 1.0
	}

	var upSpeed, downSpeed int64
	if m.lastUplink > 0 && currentUplink >= m.lastUplink {
		upSpeed = int64(float64(currentUplink-m.lastUplink) / elapsed)
	}
	if m.lastDownlink > 0 && currentDownlink >= m.lastDownlink {
		downSpeed = int64(float64(currentDownlink-m.lastDownlink) / elapsed)
	}

	m.lastUplink = currentUplink
	m.lastDownlink = currentDownlink
	m.lastStatsTime = now

	return TrafficStats{
		UploadSpeed:   upSpeed,
		DownloadSpeed: downSpeed,
		TotalUpload:   currentUplink,
		TotalDownload: currentDownlink,
	}, nil
}
