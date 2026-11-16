package tun

import (
	_ "embed"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/xjasonlyu/tun2socks/v2/engine"
	"golang.org/x/sys/windows"
)

//go:embed assets/wintun.dll
var wintunBytes []byte

//go:embed assets/zeltun.dll
var zeltunBytes []byte

const (
	TunInterfaceName = "BYP-TUN"
	// Use RFC 2544 benchmark transit subnet (standard for modern proxy clients like Clash and Sing-box)
	// This avoids any collision with 10.x.x.x or 192.168.x.x LANs.
	TunIP      = "198.18.0.2"
	TunMask    = "255.255.0.0"
	TunGateway = "198.18.0.1"

	// Windows process creation flag to completely prevent CMD console window flashing
	createNoWindow = 0x08000000
)

// silentCommand creates an exec.Cmd configured to execute 100% silently in the background
// with CREATE_NO_WINDOW so no black CMD command prompts ever flash on the user's screen.
func silentCommand(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return cmd
}

type RouteEntry struct {
	Destination string
	Netmask     string
	Gateway     string
	Interface   string
	Metric      int
}

type PhysicalAdapterInfo struct {
	Gateway   string
	LanIP     net.IP
	InterfaceIndex int
}

type TunManager struct {
	mu                   sync.Mutex
	running              bool
	activeEngine         string
	activeUpstreamTarget string
	addedRoutes          []string // List of server IPs that have static routes
	activeGateway        string
	physicalLanIP        net.IP
	physicalIfIndex      int
	splitMode            string
	splitApps            []string
	zeltunOpts           ZeltunOptions
}

func NewTunManager() *TunManager {
	return &TunManager{
		addedRoutes: []string{},
		splitMode:   "all",
		splitApps:   []string{},
		zeltunOpts:  DefaultZeltunOptions(),
	}
}

// ensureEmbeddedDLL ensures an embedded DLL is written to disk and returns its path.
func ensureEmbeddedDLL(filename string, embedded []byte, registerDllDir bool) (string, error) {
	var candidates []string
	if exePath, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exePath), filename))
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, filename))
	}
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		bypDir := filepath.Join(localAppData, "Byp")
		_ = os.MkdirAll(bypDir, 0755)
		candidates = append(candidates, filepath.Join(bypDir, filename))
	}

	for _, p := range candidates {
		info, err := os.Stat(p)
		if err == nil && info.Size() == int64(len(embedded)) {
			if registerDllDir {
				_ = windows.SetDllDirectory(filepath.Dir(p))
			}
			return p, nil
		}
		_ = os.MkdirAll(filepath.Dir(p), 0755)
		if err := os.WriteFile(p, embedded, 0755); err == nil {
			if registerDllDir {
				_ = windows.SetDllDirectory(filepath.Dir(p))
			}
			return p, nil
		}
	}

	return "", fmt.Errorf("failed to extract embedded %s to any suitable path", filename)
}

// EnsureWintunDLL ensures that the embedded wintun.dll is extracted to disk and loadable.
func EnsureWintunDLL() error {
	_, err := ensureEmbeddedDLL("wintun.dll", wintunBytes, true)
	return err
}

// EnsureZeltunDLL ensures that the embedded zeltun.dll is extracted to disk cleanly.
func EnsureZeltunDLL() (string, error) {
	return ensureEmbeddedDLL("zeltun.dll", zeltunBytes, false)
}

// EnsureWintunDLL method wrapper for TunManager
func (t *TunManager) EnsureWintunDLL() error {
	return EnsureWintunDLL()
}

// findInterfaceIndexByIP finds the OS interface index for the given IPv4 address string
func findInterfaceIndexByIP(ipStr string) int {
	ifaces, err := net.Interfaces()
	if err != nil {
		return 0
	}
	for _, ifi := range ifaces {
		addrs, err := ifi.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ip, _, err := net.ParseCIDR(a.String())
			if err == nil && ip.String() == ipStr {
				return ifi.Index
			}
		}
	}
	return 0
}

// GetPhysicalAdapterInfo retrieves the physical default gateway, LAN IP, and interface index
func (t *TunManager) GetPhysicalAdapterInfo() (PhysicalAdapterInfo, error) {
	return t.getPhysicalAdapterInfo()
}

// getPhysicalAdapterInfo retrieves the physical default gateway, LAN IP, and interface index
func (t *TunManager) getPhysicalAdapterInfo() (PhysicalAdapterInfo, error) {
	out, err := silentCommand("route", "print", "0.0.0.0").Output()
	if err != nil {
		return PhysicalAdapterInfo{}, fmt.Errorf("failed to execute route print: %w", err)
	}

	lines := strings.Split(string(out), "\n")
	var candidates []RouteEntry

	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 && fields[0] == "0.0.0.0" && fields[1] == "0.0.0.0" {
			gw := fields[2]
			iface := fields[3]
			metric, err := strconv.Atoi(fields[4])
			if err != nil {
				continue
			}

			gwIP := net.ParseIP(gw)
			if gwIP == nil || gwIP.IsUnspecified() || gwIP.IsLoopback() {
				continue
			}

			// Ignore virtual VPN gateways and transit subnets
			if strings.HasPrefix(gw, "10.255.") || strings.HasPrefix(gw, "172.19.") || strings.HasPrefix(gw, "198.18.") || strings.HasPrefix(gw, "198.19.") {
				continue
			}
			if strings.HasPrefix(iface, "198.18.") || strings.HasPrefix(iface, "198.19.") {
				continue
			}

			candidates = append(candidates, RouteEntry{
				Destination: fields[0],
				Netmask:     fields[1],
				Gateway:     gw,
				Interface:   iface,
				Metric:      metric,
			})
		}
	}

	if len(candidates) == 0 {
		return PhysicalAdapterInfo{}, fmt.Errorf("no physical default gateway found in routing table")
	}

	// Pick lowest metric
	best := candidates[0]
	for _, c := range candidates[1:] {
		if c.Metric < best.Metric {
			best = c
		}
	}

	lanIP := net.ParseIP(best.Interface)
	ifIndex := findInterfaceIndexByIP(best.Interface)

	return PhysicalAdapterInfo{
		Gateway:        best.Gateway,
		LanIP:          lanIP,
		InterfaceIndex: ifIndex,
	}, nil
}

// SetZeltunOptions stores TUN engine options and applies live updates when Zeltun is active.
func (t *TunManager) SetZeltunOptions(opts ZeltunOptions) {
	opts = opts.Normalize()
	t.mu.Lock()
	t.zeltunOpts = opts
	runningZeltun := t.running && t.activeEngine == EngineZeltun
	t.mu.Unlock()

	if runningZeltun {
		if z, err := getZeltunBridge(); err == nil {
			_ = z.SetOptions(opts)
		}
	}
}

// UpdateDNS applies Primary/Secondary DNS resolvers dynamically to the running TUN core.
func (t *TunManager) UpdateDNS(primary, secondary string) {
	t.mu.Lock()
	runningZeltun := t.running && t.activeEngine == EngineZeltun
	nrpt := t.zeltunOpts.EnableNrpt
	t.mu.Unlock()

	if runningZeltun {
		if z, err := getZeltunBridge(); err == nil {
			_ = z.SetDNS(primary, secondary, nrpt)
		}
	}
}

// UpdateSplitConfig updates split tunneling rules dynamically.
func (t *TunManager) UpdateSplitConfig(mode string, apps []string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.splitMode = mode
	t.splitApps = apps
	if t.running && t.activeEngine == EngineZeltun {
		if z, err := getZeltunBridge(); err == nil {
			_ = z.SetRules(mode, apps)
		}
		return
	}
	ClearPortCache()
	SetGlobalSplitConfig(mode, apps, t.physicalLanIP, t.physicalIfIndex)
}

// UpdatePhysicalAdapter updates routing and binding when the physical interface changes.
func (t *TunManager) UpdatePhysicalAdapter(newGateway string, newLanIP net.IP, newIfIndex int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.running {
		return
	}

	if t.activeEngine == EngineZeltun {
		t.activeGateway = newGateway
		t.physicalLanIP = newLanIP
		t.physicalIfIndex = newIfIndex
		if z, err := getZeltunBridge(); err == nil {
			lanStr := ""
			if newLanIP != nil {
				lanStr = newLanIP.String()
			}
			_ = z.UpdatePhysicalIf(newIfIndex, newGateway, lanStr)
		}
		return
	}

	for _, sIP := range t.addedRoutes {
		_ = silentCommand("route", "delete", sIP).Run()
	}

	t.activeGateway = newGateway
	t.physicalLanIP = newLanIP
	t.physicalIfIndex = newIfIndex

	for _, sIP := range t.addedRoutes {
		_ = silentCommand("route", "add", sIP, "mask", "255.255.255.255", newGateway, "metric", "1").Run()
	}

	SetGlobalSplitConfig(t.splitMode, t.splitApps, newLanIP, newIfIndex)
	ClearPortCache()
}

func resolveServerIPs(serverHost string) []string {
	var serverIPs []string
	if serverHost == "" {
		return serverIPs
	}
	if net.ParseIP(serverHost) != nil {
		return []string{serverHost}
	}
	ips, err := net.LookupIP(serverHost)
	if err != nil {
		return serverIPs
	}
	seen := make(map[string]bool)
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			s := v4.String()
			if !seen[s] {
				seen[s] = true
				serverIPs = append(serverIPs, s)
			}
		}
	}
	return serverIPs
}

func applyZeltunBypassIPs(z *zeltunBridge, serverIPs []string) {
	_ = z.ClearBypassIPs()
	for _, ip := range serverIPs {
		_ = z.AddBypassIP(ip)
	}
}

// Start activates the TUN mode interface using loopback SOCKS5 on socksPort.
func (t *TunManager) Start(serverHost string, socksPort int, splitMode string, splitApps []string, dnsPrimary, dnsSecondary string) error {
	return t.StartWithUpstream(serverHost, "127.0.0.1", socksPort, splitMode, splitApps, dnsPrimary, dnsSecondary)
}

// StartWithUpstream activates the TUN interface targeting any configured SOCKS5 host:port.
func (t *TunManager) StartWithUpstream(serverHost, socksHost string, socksPort int, splitMode string, splitApps []string, dnsPrimary, dnsSecondary string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	resolvedSocksIP, socksTarget, socksIsPublic, err := ResolveUpstreamTarget(socksHost, socksPort)
	if err != nil {
		return err
	}

	opts := t.zeltunOpts.Normalize()
	if t.running {
		if t.activeEngine == EngineZeltun && opts.Engine == EngineZeltun && t.activeUpstreamTarget == socksTarget {
			if z, err := getZeltunBridge(); err == nil {
				serverIPs := resolveServerIPs(serverHost)
				if socksIsPublic {
					serverIPs = appendUniqueString(serverIPs, resolvedSocksIP)
				}
				applyZeltunBypassIPs(z, serverIPs)
				_ = z.SetDNS(dnsPrimary, dnsSecondary, opts.EnableNrpt)
				_ = z.SetOptions(opts)
				_ = z.SetRules(splitMode, splitApps)
				_ = z.SetSocks(socksTarget)
				t.splitMode = splitMode
				t.splitApps = splitApps
			}
			return nil
		}
		_ = t.stopLocked()
	}

	if err := t.EnsureWintunDLL(); err != nil {
		return err
	}

	serverIPs := resolveServerIPs(serverHost)
	if socksIsPublic {
		serverIPs = appendUniqueString(serverIPs, resolvedSocksIP)
	}

	// 2. Find physical gateway and adapter info for anti-loop static bypass
	adapterInfo, err := t.getPhysicalAdapterInfo()
	if err != nil || adapterInfo.Gateway == "" {
		return fmt.Errorf("cannot activate TUN mode: physical network gateway not detected: %w", err)
	}
	t.activeGateway = adapterInfo.Gateway
	t.physicalLanIP = adapterInfo.LanIP
	t.physicalIfIndex = adapterInfo.InterfaceIndex
	t.splitMode = splitMode
	t.splitApps = splitApps

	if opts.Engine == EngineZeltun {
		z, err := getZeltunBridge()
		if err != nil {
			return err
		}
		applyZeltunBypassIPs(z, serverIPs)
		lanStr := ""
		if adapterInfo.LanIP != nil {
			lanStr = adapterInfo.LanIP.String()
		}
		_ = z.UpdatePhysicalIf(adapterInfo.InterfaceIndex, adapterInfo.Gateway, lanStr)
		if err := z.ConfigureAdapter(TunInterfaceName, TunIP, TunGateway, opts.MTU); err != nil {
			return err
		}
		if err := z.SetDNS(dnsPrimary, dnsSecondary, opts.EnableNrpt); err != nil {
			return err
		}
		_ = z.SetOptions(opts)
		_ = z.SetRules(splitMode, splitApps)
		if err := z.Start(socksTarget, uint32(adapterInfo.InterfaceIndex), opts.RingMB); err != nil {
			return err
		}
		t.activeEngine = EngineZeltun
		t.activeUpstreamTarget = socksTarget
		t.running = true
		return nil
	}

	// Legacy tun2socks path
	SetGlobalSplitConfig(splitMode, splitApps, adapterInfo.LanIP, adapterInfo.InterfaceIndex)

	// Add static bypass route for each resolved server IP through physical gateway (metric 1)
	seenIP := make(map[string]bool)
	for _, sIP := range serverIPs {
		if sIP == "" || seenIP[sIP] {
			continue
		}
		seenIP[sIP] = true
		_ = silentCommand("route", "delete", sIP).Run()
		_ = silentCommand("route", "add", sIP, "mask", "255.255.255.255", adapterInfo.Gateway, "metric", "1").Run()
		t.addedRoutes = append(t.addedRoutes, sIP)
	}

	tunMtu := opts.MTU
	if tunMtu <= 0 {
		tunMtu = 9000
	}
	proxyURL := fmt.Sprintf("split-router://%s", socksTarget)
	key := &engine.Key{
		Device:   TunInterfaceName,
		Proxy:    proxyURL,
		MTU:      tunMtu,
		LogLevel: "silent",
	}

	engine.Insert(key)
	engine.Start()

	// Wait briefly for wintun adapter to initialize
	time.Sleep(1 * time.Second)

	// 4. Assign IP address and Gateway to WailsVPN-TUN interface silently
	setAddrCmd := silentCommand("netsh", "interface", "ip", "set", "address",
		fmt.Sprintf("name=%s", TunInterfaceName),
		"source=static",
		"addr="+TunIP,
		"mask="+TunMask,
		"gateway="+TunGateway,
	)
	_ = setAddrCmd.Run()

	// Enable Jumbo MTU (9000) on Wintun to cut gVisor userspace packet rate and CPU overhead by up to 80%
	_ = silentCommand("netsh", "interface", "ipv4", "set", "subinterface", TunInterfaceName, "mtu=9000", "store=active").Run()

	// Set DNS silently (User-customized Primary and Secondary DNS)
	primary := strings.TrimSpace(dnsPrimary)
	if primary == "" {
		primary = "1.1.1.1"
	}
	_ = silentCommand("netsh", "interface", "ip", "set", "dns",
		fmt.Sprintf("name=%s", TunInterfaceName),
		"static",
		primary,
		"primary",
	).Run()

	secondary := strings.TrimSpace(dnsSecondary)
	if secondary != "" {
		_ = silentCommand("netsh", "interface", "ip", "add", "dns",
			fmt.Sprintf("name=%s", TunInterfaceName),
			secondary,
			"index=2",
		).Run()
	}

	// 5. Apply the standard "Two-Halves" default route pattern (0.0.0.0/1 and 128.0.0.0/1)
	// This is the rock-solid method used by WireGuard, Sing-box, and OpenVPN.
	// It guarantees:
	// a) All general traffic goes to TUN (/1 is more specific than default /0).
	// b) Server /32 routes and local LAN routes take precedence (/32, /24, /16 are more specific than /1).
	// c) The physical 0.0.0.0/0 route remains untouched, preventing disconnections.
	_ = silentCommand("route", "add", "0.0.0.0", "mask", "128.0.0.0", TunGateway, "metric", "5").Run()
	_ = silentCommand("route", "add", "128.0.0.0", "mask", "128.0.0.0", TunGateway, "metric", "5").Run()

	t.activeEngine = EngineTun2Socks
	t.activeUpstreamTarget = socksTarget
	t.running = true
	return nil
}

func appendUniqueString(slice []string, item string) []string {
	if item == "" {
		return slice
	}
	for _, existing := range slice {
		if existing == item {
			return slice
		}
	}
	return append(slice, item)
}

// PollZeltunLogs drains buffered log lines emitted by the native Zeltun core.
func (t *TunManager) PollZeltunLogs() []string {
	t.mu.Lock()
	isZeltun := t.activeEngine == EngineZeltun
	t.mu.Unlock()
	if !isZeltun {
		return nil
	}
	z, err := getZeltunBridge()
	if err != nil {
		return nil
	}
	var out []string
	for i := 0; i < 32; i++ {
		_, msg, ok := z.PollLog()
		if !ok {
			break
		}
		out = append(out, msg)
	}
	return out
}

// GetZeltunStats retrieves extended telemetry from the native Zeltun core.
func (t *TunManager) GetZeltunStats() (ZeltunStats, bool) {
	t.mu.Lock()
	runningZeltun := t.running && t.activeEngine == EngineZeltun
	t.mu.Unlock()
	if !runningZeltun {
		return ZeltunStats{}, false
	}
	z, err := getZeltunBridge()
	if err != nil {
		return ZeltunStats{}, false
	}
	st, err := z.GetStatsEx()
	if err != nil {
		return ZeltunStats{}, false
	}
	return st, true
}

// Stop deactivates TUN mode, clears routing table entries, and stops the active TUN engine.
func (t *TunManager) Stop() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.stopLocked()
}

func (t *TunManager) stopLocked() error {
	if !t.running {
		return nil
	}

	if t.activeEngine == EngineZeltun {
		if z, err := getZeltunBridge(); err == nil {
			_ = z.Stop()
		}
		t.activeEngine = ""
		t.activeUpstreamTarget = ""
		t.running = false
		return nil
	}

	// Remove two-halves default routes silently
	_ = silentCommand("route", "delete", "0.0.0.0", "mask", "128.0.0.0", TunGateway).Run()
	_ = silentCommand("route", "delete", "128.0.0.0", "mask", "128.0.0.0", TunGateway).Run()

	// Clean up legacy 0.0.0.0/0 if present
	_ = silentCommand("route", "delete", "0.0.0.0", "mask", "0.0.0.0", TunGateway).Run()

	// Remove static server routes silently
	for _, sIP := range t.addedRoutes {
		_ = silentCommand("route", "delete", sIP).Run()
	}
	t.addedRoutes = []string{}

	// Stop tun2socks engine
	engine.Stop()

	// Clear socket tables and cached process entries
	ClearPortCache()

	t.activeEngine = ""
	t.activeUpstreamTarget = ""
	t.running = false
	return nil
}

// CleanupStaleRoutes cleans up any orphaned TUN routes from previous abrupt shutdowns or crashes
func (t *TunManager) CleanupStaleRoutes() error {
	if z, err := getZeltunBridge(); err == nil {
		z.CleanupStale(TunInterfaceName, TunGateway)
	}
	_ = silentCommand("route", "delete", "0.0.0.0", "mask", "128.0.0.0", TunGateway).Run()
	_ = silentCommand("route", "delete", "128.0.0.0", "mask", "128.0.0.0", TunGateway).Run()
	_ = silentCommand("route", "delete", "0.0.0.0", "mask", "0.0.0.0", TunGateway).Run()
	return nil
}

// IsRunning reports whether TUN mode is currently running
func (t *TunManager) IsRunning() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.running
}
