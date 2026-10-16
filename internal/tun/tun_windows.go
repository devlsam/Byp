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
	mu              sync.Mutex
	running         bool
	addedRoutes     []string // List of server IPs that have static routes
	activeGateway   string
	physicalLanIP   net.IP
	physicalIfIndex int
	splitMode       string
	splitApps       []string
}

func NewTunManager() *TunManager {
	return &TunManager{
		addedRoutes: []string{},
		splitMode:   "all",
		splitApps:   []string{},
	}
}

// EnsureWintunDLL ensures that the embedded wintun.dll is extracted to disk and loadable.
// It checks next to the executable, in CWD, and in LocalAppData, extracting if missing or corrupted,
// and registers the directory in the Windows DLL search path via SetDllDirectory.
func EnsureWintunDLL() error {
	var candidates []string

	// 1. Target next to the executable
	if exePath, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exePath), "wintun.dll"))
	}

	// 2. Target in current working directory
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "wintun.dll"))
	}

	// 3. Target in LocalAppData\Byp (safe fallback if exe is in read-only location)
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		bypDir := filepath.Join(localAppData, "Byp")
		_ = os.MkdirAll(bypDir, 0755)
		candidates = append(candidates, filepath.Join(bypDir, "wintun.dll"))
	}

	var validPath string
	for _, p := range candidates {
		info, err := os.Stat(p)
		if err == nil && info.Size() == int64(len(wintunBytes)) {
			validPath = p
			break
		}

		// File is missing or incorrect size -> extract embedded bytes
		dir := filepath.Dir(p)
		_ = os.MkdirAll(dir, 0755)
		if err := os.WriteFile(p, wintunBytes, 0755); err == nil {
			validPath = p
			break
		}
	}

	if validPath != "" {
		dir := filepath.Dir(validPath)
		_ = windows.SetDllDirectory(dir)
		return nil
	}

	return fmt.Errorf("failed to extract embedded wintun.dll to any suitable path")
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

			// Ignore virtual VPN gateways
			if strings.HasPrefix(gw, "10.255.") || strings.HasPrefix(gw, "172.19.") || strings.HasPrefix(gw, "198.18.") {
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

// UpdateSplitConfig dynamically modifies the Per-App Split Tunneling rules on the active TUN interface
func (t *TunManager) UpdateSplitConfig(mode string, apps []string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.splitMode = mode
	t.splitApps = apps

	SetGlobalSplitConfig(mode, apps, t.physicalLanIP, t.physicalIfIndex)
}

// Start activates the TUN mode interface, anti-routing loop routes, Per-App router, and tun2socks engine
func (t *TunManager) Start(serverHost string, socksPort int, splitMode string, splitApps []string, dnsPrimary, dnsSecondary string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.running {
		return nil
	}

	if err := t.EnsureWintunDLL(); err != nil {
		return err
	}

	// 1. Resolve server host IPs to prevent routing loops
	var serverIPs []string
	if serverHost != "" {
		if net.ParseIP(serverHost) != nil {
			serverIPs = append(serverIPs, serverHost)
		} else {
			ips, err := net.LookupIP(serverHost)
			if err == nil {
				for _, ip := range ips {
					if ip.To4() != nil {
						serverIPs = append(serverIPs, ip.String())
					}
				}
			}
		}
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

	// Configure our custom Per-App split router with physical adapter binding
	SetGlobalSplitConfig(splitMode, splitApps, adapterInfo.LanIP, adapterInfo.InterfaceIndex)

	// Add static bypass route for each server IP through physical gateway (metric 1)
	// This is the absolute guarantee against routing loops!
	for _, sIP := range serverIPs {
		_ = silentCommand("route", "add", sIP, "mask", "255.255.255.255", adapterInfo.Gateway, "metric", "1").Run()
		t.addedRoutes = append(t.addedRoutes, sIP)
	}

	// 3. Configure and start tun2socks engine with custom Per-App split router
	proxyURL := fmt.Sprintf("split-router://127.0.0.1:%d", socksPort)
	key := &engine.Key{
		Device:   TunInterfaceName,
		Proxy:    proxyURL,
		MTU:      1500,
		LogLevel: "warn", // Reduced log verbosity to prevent CPU/RAM overhead
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

	t.running = true
	return nil
}

// Stop deactivates TUN mode, clears routing table entries, and stops tun2socks
func (t *TunManager) Stop() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if !t.running {
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

	t.running = false
	return nil
}

// CleanupStaleRoutes cleans up any orphaned TUN routes from previous abrupt shutdowns or crashes
func (t *TunManager) CleanupStaleRoutes() error {
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
