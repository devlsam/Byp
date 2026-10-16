package core

import (
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/xtls/libxray/nodep"
)

// MeasureActiveDelay tests real HTTP latency via the active local SOCKS5 proxy port.
func (m *XrayManager) MeasureActiveDelay(targetURL string, socksPort int) (int64, error) {
	if !m.IsRunning() {
		return -1, fmt.Errorf("xray is not running")
	}
	proxyAddr := fmt.Sprintf("socks5://127.0.0.1:%d", socksPort)
	delay, err := nodep.MeasureDelay(8, targetURL, proxyAddr)
	if err != nil {
		return -1, err
	}
	return delay, nil
}

// MeasureServerPing tests network latency to a target server.
// If the core engine is running, it tests end-to-end HTTP delay; otherwise it performs a TCP handshake probe.
func (m *XrayManager) MeasureServerPing(server string, port int, targetURL string, socksPort int) int64 {
	if m.IsRunning() {
		if delay, err := m.MeasureActiveDelay(targetURL, socksPort); err == nil && delay > 0 {
			return delay
		}
	}

	if server != "" && port > 0 {
		start := time.Now()
		target := net.JoinHostPort(server, strconv.Itoa(port))
		conn, err := net.DialTimeout("tcp", target, 4*time.Second)
		if err == nil {
			delay := time.Since(start).Milliseconds()
			_ = conn.Close()
			return delay
		}
	}

	return -1
}
