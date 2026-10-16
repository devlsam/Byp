package tun

import (
	"context"
	"fmt"
	"math/bits"
	"net"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	M "github.com/xjasonlyu/tun2socks/v2/metadata"
	"github.com/xjasonlyu/tun2socks/v2/proxy"
	"github.com/xjasonlyu/tun2socks/v2/proxy/socks5"
	"golang.org/x/sys/windows"
)

var (
	activeRouterMu sync.RWMutex
	activeRouter   *SplitRouterProxy
)

func init() {
	// Register the custom "split-router" protocol in tun2socks
	proxy.RegisterProtocol("split-router", func(u *url.URL) (proxy.Proxy, error) {
		socksAddr := u.Host
		s5, err := socks5.New(socksAddr, "", "")
		if err != nil {
			return nil, fmt.Errorf("failed to create socks5 backend: %w", err)
		}

		activeRouterMu.Lock()
		defer activeRouterMu.Unlock()

		if activeRouter == nil {
			activeRouter = &SplitRouterProxy{
				socks5Proxy: s5,
				mode:        "all",
				apps:        []string{},
			}
		} else {
			activeRouter.socks5Proxy = s5
		}
		return activeRouter, nil
	})
}

// SplitRouterProxy implements tun2socks proxy.Proxy with Per-App Split Tunneling
type SplitRouterProxy struct {
	mu              sync.RWMutex
	socks5Proxy     proxy.Proxy
	mode            string // "all", "whitelist", "blacklist"
	apps            []string
	normalizedApps  map[string]struct{} // Pre-compiled O(1) lookup map
	physicalLanIP   net.IP
	physicalIfIndex int
}

// UpdateConfig dynamically updates split tunneling rules and physical adapter binding
func (r *SplitRouterProxy) UpdateConfig(mode string, apps []string, lanIP net.IP, ifIndex int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if mode == "" {
		mode = "all"
	}
	r.mode = strings.ToLower(mode)
	r.apps = apps

	// Pre-compile O(1) normalized lookup map for instant zero-allocation matching
	norm := make(map[string]struct{}, len(apps)*2)
	for _, app := range apps {
		appTrimmed := strings.ToLower(strings.TrimSpace(app))
		if appTrimmed == "" {
			continue
		}
		norm[appTrimmed] = struct{}{}
		norm[strings.ToLower(filepath.Base(appTrimmed))] = struct{}{}
	}
	r.normalizedApps = norm

	if lanIP != nil {
		r.physicalLanIP = lanIP
	}
	if ifIndex > 0 {
		r.physicalIfIndex = ifIndex
	}
}

// SetGlobalSplitConfig sets config on the active router if running
func SetGlobalSplitConfig(mode string, apps []string, lanIP net.IP, ifIndex int) {
	activeRouterMu.Lock()
	defer activeRouterMu.Unlock()

	if activeRouter == nil {
		activeRouter = &SplitRouterProxy{
			mode:            strings.ToLower(mode),
			apps:            apps,
			physicalLanIP:   lanIP,
			physicalIfIndex: ifIndex,
		}
		activeRouter.UpdateConfig(mode, apps, lanIP, ifIndex)
	} else {
		activeRouter.UpdateConfig(mode, apps, lanIP, ifIndex)
	}
}

func (r *SplitRouterProxy) shouldProxy(metadata *M.Metadata) bool {
	r.mu.RLock()
	mode := r.mode
	norm := r.normalizedApps
	r.mu.RUnlock()

	// Mode: Global TUN -> Proxy all traffic
	if mode == "" || mode == "all" || mode == "global" {
		return true
	}

	// DNS Rule (Port 53):
	// In Whitelist mode, proxy DNS queries through Xray to protect whitelisted apps from ISP DNS poisoning.
	if metadata.DstPort == 53 && mode == "whitelist" {
		return true
	}

	// Resolve the application owning the local socket from original source port
	network := "tcp"
	if metadata.Network == M.UDP {
		network = "udp"
	}

	exeName, exePath, _ := ResolveProcessByPort(network, metadata.SrcPort)
	matched := matchAppFast(exeName, exePath, norm)

	if mode == "whitelist" {
		// Whitelist: ONLY matched apps are routed through VPN
		return matched
	}

	if mode == "blacklist" {
		// Blacklist: Matched apps bypass VPN, everything else goes through VPN
		return !matched
	}

	return true
}

func matchAppFast(exeName, exePath string, norm map[string]struct{}) bool {
	if len(norm) == 0 {
		return false
	}
	if exeName != "" {
		if _, ok := norm[strings.ToLower(exeName)]; ok {
			return true
		}
	}
	if exePath != "" {
		if _, ok := norm[strings.ToLower(exePath)]; ok {
			return true
		}
	}
	return false
}

// DialContext handles TCP connections entering the TUN interface
func (r *SplitRouterProxy) DialContext(ctx context.Context, metadata *M.Metadata) (net.Conn, error) {
	if r.shouldProxy(metadata) {
		r.mu.RLock()
		s5 := r.socks5Proxy
		r.mu.RUnlock()
		if s5 != nil {
			return s5.DialContext(ctx, metadata)
		}
	}

	// Bypassed Connection: Dial directly through physical hardware NIC
	return r.dialDirectTCP(ctx, metadata)
}

func (r *SplitRouterProxy) dialDirectTCP(ctx context.Context, metadata *M.Metadata) (net.Conn, error) {
	r.mu.RLock()
	lanIP := r.physicalLanIP
	ifIndex := r.physicalIfIndex
	r.mu.RUnlock()

	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	if lanIP != nil && !lanIP.IsUnspecified() {
		dialer.LocalAddr = &net.TCPAddr{IP: lanIP}
	}

	if ifIndex > 0 {
		netOrderVal := bits.ReverseBytes32(uint32(ifIndex))

		dialer.Control = func(network, address string, c syscall.RawConn) error {
			return c.Control(func(fd uintptr) {
				const IP_UNICAST_IF = 31
				_ = windows.SetsockoptInt(windows.Handle(fd), windows.IPPROTO_IP, IP_UNICAST_IF, int(netOrderVal))
			})
		}
	}

	return dialer.DialContext(ctx, "tcp", metadata.DestinationAddress())
}

// DialUDP handles UDP sessions entering the TUN interface
func (r *SplitRouterProxy) DialUDP(metadata *M.Metadata) (net.PacketConn, error) {
	if r.shouldProxy(metadata) {
		r.mu.RLock()
		s5 := r.socks5Proxy
		r.mu.RUnlock()
		if s5 != nil {
			return s5.DialUDP(metadata)
		}
	}

	// Bypassed UDP Session: Listen and send directly via physical hardware NIC
	return r.listenDirectUDP(metadata)
}

func (r *SplitRouterProxy) listenDirectUDP(metadata *M.Metadata) (net.PacketConn, error) {
	r.mu.RLock()
	lanIP := r.physicalLanIP
	ifIndex := r.physicalIfIndex
	r.mu.RUnlock()

	var bindAddr string
	if lanIP != nil && !lanIP.IsUnspecified() {
		bindAddr = fmt.Sprintf("%s:0", lanIP.String())
	} else {
		bindAddr = "0.0.0.0:0"
	}

	lc := net.ListenConfig{}
	if ifIndex > 0 {
		netOrderVal := bits.ReverseBytes32(uint32(ifIndex))

		lc.Control = func(network, address string, c syscall.RawConn) error {
			return c.Control(func(fd uintptr) {
				const IP_UNICAST_IF = 31
				_ = windows.SetsockoptInt(windows.Handle(fd), windows.IPPROTO_IP, IP_UNICAST_IF, int(netOrderVal))
			})
		}
	}

	pc, err := lc.ListenPacket(context.Background(), "udp4", bindAddr)
	if err != nil {
		return nil, err
	}

	return &directPacketConn{PacketConn: pc}, nil
}

type directPacketConn struct {
	net.PacketConn
}

func (pc *directPacketConn) WriteTo(b []byte, addr net.Addr) (int, error) {
	if udpAddr, ok := addr.(*net.UDPAddr); ok {
		return pc.PacketConn.WriteTo(b, udpAddr)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", addr.String())
	if err != nil {
		return 0, err
	}
	return pc.PacketConn.WriteTo(b, udpAddr)
}
