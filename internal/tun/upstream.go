package tun

import (
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
)

// UpstreamTestResult reports reachability and SOCKS5 readiness for an external upstream proxy.
type UpstreamTestResult struct {
	Reachable  bool   `json:"reachable"`
	SocksReady bool   `json:"socksReady"`
	LatencyMs  int64  `json:"latencyMs"`
	ResolvedIP string `json:"resolvedIp"`
	Target     string `json:"target"`
	Message    string `json:"message"`
}

// ResolveUpstreamTarget normalizes and resolves an upstream proxy host:port into a concrete IPv4 target.
func ResolveUpstreamTarget(host string, port int) (resolvedIP string, target string, isPublic bool, err error) {
	if port <= 0 || port > 65535 {
		return "", "", false, fmt.Errorf("upstream port must be between 1 and 65535")
	}

	h := strings.TrimSpace(host)
	if h == "" || strings.EqualFold(h, "localhost") {
		h = "127.0.0.1"
	}

	var ip net.IP
	if parsed := net.ParseIP(h); parsed != nil {
		if parsed.IsUnspecified() {
			return "", "", false, fmt.Errorf("cannot target 0.0.0.0; enter 127.0.0.1 or a specific IP")
		}
		if v4 := parsed.To4(); v4 != nil {
			ip = v4
		} else if parsed.IsLoopback() {
			ip = net.IPv4(127, 0, 0, 1)
		} else {
			return "", "", false, fmt.Errorf("IPv6 upstream address is not supported by TUN; use IPv4")
		}
	} else {
		ips, lookupErr := net.LookupIP(h)
		if lookupErr != nil {
			return "", "", false, fmt.Errorf("failed to resolve host %q: %w", h, lookupErr)
		}
		for _, candidate := range ips {
			if v4 := candidate.To4(); v4 != nil {
				ip = v4
				break
			}
		}
		if ip == nil {
			return "", "", false, fmt.Errorf("no IPv4 address found for host %q", h)
		}
	}

	resolvedIP = ip.String()
	target = net.JoinHostPort(resolvedIP, strconv.Itoa(port))
	isPublic = !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsMulticast()
	return resolvedIP, target, isPublic, nil
}

// TestUpstreamProxy dials the configured upstream address and verifies a SOCKS5 no-auth handshake.
func TestUpstreamProxy(host string, port int) UpstreamTestResult {
	resolvedIP, target, _, err := ResolveUpstreamTarget(host, port)
	if err != nil {
		return UpstreamTestResult{
			Message: err.Error(),
		}
	}

	start := time.Now()
	conn, err := net.DialTimeout("tcp", target, 2*time.Second)
	if err != nil {
		return UpstreamTestResult{
			ResolvedIP: resolvedIP,
			Target:     target,
			Message:    fmt.Sprintf("Unreachable (%v)", err),
		}
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := conn.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		return UpstreamTestResult{
			Reachable:  true,
			ResolvedIP: resolvedIP,
			Target:     target,
			Message:    fmt.Sprintf("Connected, but failed SOCKS5 greeting: %v", err),
		}
	}

	var reply [2]byte
	if _, err := io.ReadFull(conn, reply[:]); err != nil {
		return UpstreamTestResult{
			Reachable:  true,
			ResolvedIP: resolvedIP,
			Target:     target,
			Message:    "Port is open, but did not respond as SOCKS5 (verify SOCKS5 inbound, not HTTP)",
		}
	}

	latency := time.Since(start).Milliseconds()
	if latency < 1 {
		latency = 1
	}

	if reply[0] != 0x05 {
		return UpstreamTestResult{
			Reachable:  true,
			LatencyMs:  latency,
			ResolvedIP: resolvedIP,
			Target:     target,
			Message:    "Port is open, but protocol is not SOCKS5 (make sure it is a SOCKS5 port, not HTTP)",
		}
	}

	if reply[1] != 0x00 {
		msg := "Upstream SOCKS5 requires authentication (no-auth not accepted)"
		if reply[1] == 0xff {
			msg = "Upstream SOCKS5 rejected no-auth greeting"
		}
		return UpstreamTestResult{
			Reachable:  true,
			LatencyMs:  latency,
			ResolvedIP: resolvedIP,
			Target:     target,
			Message:    msg,
		}
	}

	return UpstreamTestResult{
		Reachable:  true,
		SocksReady: true,
		LatencyMs:  latency,
		ResolvedIP: resolvedIP,
		Target:     target,
		Message:    fmt.Sprintf("SOCKS5 proxy ready (%s)", target),
	}
}

