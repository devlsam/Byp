package tun

import (
	"fmt"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

const (
	ZeltunOptBlockQuic  uint32 = 1 << 0
	ZeltunOptMssClamp   uint32 = 1 << 1
	ZeltunOptSniSniff   uint32 = 1 << 2
	ZeltunOptBypassLan  uint32 = 1 << 3
	ZeltunOptGamingQos  uint32 = 1 << 4
	ZeltunOptCleanDns   uint32 = 1 << 5
	ZeltunOptStrictLeak uint32 = 1 << 6

	EngineZeltun    = "zeltun"
	EngineTun2Socks = "tun2socks"
)

// ZeltunOptions holds user-configurable tuning knobs for the Rust Zeltun TUN core.
type ZeltunOptions struct {
	Engine         string `json:"engine"`
	MTU            int    `json:"mtu"`
	BlockQuic      bool   `json:"blockQuic"`
	MssClamp       bool   `json:"mssClamp"`
	TcpMss         int    `json:"tcpMss"`
	SniSniff       bool   `json:"sniSniff"`
	BypassLan      bool   `json:"bypassLan"`
	GamingQos      bool   `json:"gamingQos"`
	CleanDns       bool   `json:"cleanDns"`
	StrictAntiLeak bool   `json:"strictAntiLeak"`
	EnableNrpt     bool   `json:"enableNrpt"`
	BlockIpv6      bool   `json:"blockIpv6"`
	UdpTimeoutSec  int    `json:"udpTimeoutSec"`
	RingMB         int    `json:"ringMb"`
}

// DefaultZeltunOptions returns balanced defaults matching Zeltun's core settings.
func DefaultZeltunOptions() ZeltunOptions {
	return ZeltunOptions{
		Engine:         EngineZeltun,
		MTU:            1500,
		BlockQuic:      true,
		MssClamp:       false,
		TcpMss:         1360,
		SniSniff:       false,
		BypassLan:      true,
		GamingQos:      true,
		CleanDns:       true,
		StrictAntiLeak: false,
		EnableNrpt:     true,
		BlockIpv6:      true,
		UdpTimeoutSec:  120,
		RingMB:         4,
	}
}

// Normalize clamps user-supplied options into safe bounds.
func (o ZeltunOptions) Normalize() ZeltunOptions {
	if o.Engine != EngineTun2Socks && o.Engine != EngineZeltun {
		o.Engine = EngineZeltun
	}
	if o.MTU < 576 || o.MTU > 9000 {
		if o.Engine == EngineTun2Socks {
			o.MTU = 9000
		} else {
			o.MTU = 1500
		}
	}
	if o.TcpMss < 536 || o.TcpMss > 1460 {
		o.TcpMss = 1360
	}
	if o.UdpTimeoutSec < 10 || o.UdpTimeoutSec > 600 {
		o.UdpTimeoutSec = 120
	}
	if o.RingMB < 1 || o.RingMB > 16 {
		o.RingMB = 4
	}
	return o
}

// Bitmask encodes boolean feature flags into Zeltun's OPT_* FFI bitmask.
func (o ZeltunOptions) Bitmask() uint32 {
	var flags uint32
	if o.BlockQuic {
		flags |= ZeltunOptBlockQuic
	}
	if o.MssClamp {
		flags |= ZeltunOptMssClamp
	}
	if o.SniSniff {
		flags |= ZeltunOptSniSniff
	}
	if o.BypassLan {
		flags |= ZeltunOptBypassLan
	}
	if o.GamingQos {
		flags |= ZeltunOptGamingQos
	}
	if o.CleanDns {
		flags |= ZeltunOptCleanDns
	}
	if o.StrictAntiLeak {
		flags |= ZeltunOptStrictLeak
	}
	return flags
}

// ZeltunStats mirrors the C-ABI ZeltunStatsEx struct returned by zeltun.dll (56 bytes).
type ZeltunStats struct {
	StructSize        uint32 `json:"structSize"`
	IsRunning         uint32 `json:"isRunning"`
	RxBytes           uint64 `json:"rxBytes"`
	TxBytes           uint64 `json:"txBytes"`
	ProxyBytes        uint64 `json:"proxyBytes"`
	DirectBytes       uint64 `json:"directBytes"`
	DroppedPackets    uint64 `json:"droppedPackets"`
	ActiveTcpConns    uint32 `json:"activeTcpConns"`
	ActiveUdpSessions uint32 `json:"activeUdpSessions"`
}

func zeltunSplitModeByte(mode string) uint8 {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "whitelist", "include":
		return 1
	case "blacklist", "exclude":
		return 2
	default:
		return 0
	}
}

func boolU8(b bool) uintptr {
	if b {
		return 1
	}
	return 0
}

func cstrBytes(s string) ([]byte, uintptr) {
	b := make([]byte, len(s)+1)
	copy(b, s)
	return b, uintptr(unsafe.Pointer(&b[0]))
}

type zeltunBridge struct {
	dll *syscall.LazyDLL

	procStart           *syscall.LazyProc
	procStop            *syscall.LazyProc
	procSetRules        *syscall.LazyProc
	procSetOptions      *syscall.LazyProc
	procConfigAdapter   *syscall.LazyProc
	procSetDns          *syscall.LazyProc
	procSetTunBehavior  *syscall.LazyProc
	procUpdatePhysIf    *syscall.LazyProc
	procSetSocks        *syscall.LazyProc
	procAddBypassIp     *syscall.LazyProc
	procClearBypassIps  *syscall.LazyProc
	procGetStatsEx      *syscall.LazyProc
	procCleanupStale    *syscall.LazyProc
	procPollLog         *syscall.LazyProc
	procGetLastError    *syscall.LazyProc
}

var (
	zeltunMu       sync.Mutex
	zeltunInstance *zeltunBridge
)

func getZeltunBridge() (*zeltunBridge, error) {
	zeltunMu.Lock()
	defer zeltunMu.Unlock()

	if zeltunInstance != nil {
		return zeltunInstance, nil
	}
	dllPath, err := EnsureZeltunDLL()
	if err != nil {
		return nil, err
	}
	dll := syscall.NewLazyDLL(dllPath)
	if err := dll.Load(); err != nil {
		return nil, fmt.Errorf("failed to load zeltun.dll from %s: %w", dllPath, err)
	}

	b := &zeltunBridge{
		dll:                dll,
		procStart:          dll.NewProc("zeltun_start"),
		procStop:           dll.NewProc("zeltun_stop"),
		procSetRules:       dll.NewProc("zeltun_set_rules"),
		procSetOptions:     dll.NewProc("zeltun_set_options"),
		procConfigAdapter:  dll.NewProc("zeltun_configure_adapter"),
		procSetDns:         dll.NewProc("zeltun_set_dns"),
		procSetTunBehavior: dll.NewProc("zeltun_set_tun_behavior"),
		procUpdatePhysIf:   dll.NewProc("zeltun_update_physical_if"),
		procSetSocks:       dll.NewProc("zeltun_set_socks"),
		procAddBypassIp:    dll.NewProc("zeltun_add_bypass_ip"),
		procClearBypassIps: dll.NewProc("zeltun_clear_bypass_ips"),
		procGetStatsEx:     dll.NewProc("zeltun_get_stats_ex"),
		procCleanupStale:   dll.NewProc("zeltun_cleanup_stale"),
		procPollLog:        dll.NewProc("zeltun_poll_log"),
		procGetLastError:   dll.NewProc("zeltun_get_last_error"),
	}
	zeltunInstance = b
	return b, nil
}

func (b *zeltunBridge) checkRet(r uintptr, action string) error {
	if int32(r) == 0 {
		return nil
	}
	if msg := b.LastError(); msg != "" {
		return fmt.Errorf("%s failed: %s", action, msg)
	}
	return fmt.Errorf("%s failed (code=%d)", action, int32(r))
}

func (b *zeltunBridge) LastError() string {
	var buf [512]byte
	r, _, _ := b.procGetLastError.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	runtime.KeepAlive(&buf)
	n := int32(r)
	if n <= 0 {
		return ""
	}
	if int(n) > len(buf) {
		n = int32(len(buf))
	}
	return string(buf[:n])
}

func (b *zeltunBridge) PollLog() (uint8, string, bool) {
	var buf [1024]byte
	var lvl uint8
	r, _, _ := b.procPollLog.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&lvl)))
	runtime.KeepAlive(&buf)
	runtime.KeepAlive(&lvl)
	n := int32(r)
	if n <= 0 {
		return 0, "", false
	}
	if int(n) > len(buf) {
		n = int32(len(buf))
	}
	return lvl, string(buf[:n]), true
}

func (b *zeltunBridge) ConfigureAdapter(name, tunIP, tunGW string, mtu int) error {
	nB, nP := cstrBytes(name)
	iB, iP := cstrBytes(tunIP)
	gB, gP := cstrBytes(tunGW)
	r, _, _ := b.procConfigAdapter.Call(nP, iP, gP, uintptr(uint32(mtu)))
	runtime.KeepAlive(nB)
	runtime.KeepAlive(iB)
	runtime.KeepAlive(gB)
	return b.checkRet(r, "zeltun_configure_adapter")
}

func (b *zeltunBridge) SetDNS(primary, secondary string, enableNrpt bool) error {
	if strings.TrimSpace(primary) == "" {
		primary = "1.1.1.1"
	}
	pB, pP := cstrBytes(strings.TrimSpace(primary))
	var sP uintptr
	var sB []byte
	if strings.TrimSpace(secondary) != "" {
		sB, sP = cstrBytes(strings.TrimSpace(secondary))
	}
	r, _, _ := b.procSetDns.Call(pP, sP, boolU8(enableNrpt))
	runtime.KeepAlive(pB)
	runtime.KeepAlive(sB)
	return b.checkRet(r, "zeltun_set_dns")
}

func (b *zeltunBridge) SetOptions(opts ZeltunOptions) error {
	opts = opts.Normalize()
	r1, _, _ := b.procSetOptions.Call(uintptr(opts.Bitmask()), uintptr(uint16(opts.TcpMss)))
	if err := b.checkRet(r1, "zeltun_set_options"); err != nil {
		return err
	}
	var ipv6Mode uintptr = 0 // 0 = blackhole ::/1
	if !opts.BlockIpv6 {
		ipv6Mode = 1
	}
	r2, _, _ := b.procSetTunBehavior.Call(ipv6Mode, boolU8(opts.StrictAntiLeak), uintptr(uint32(opts.UdpTimeoutSec)))
	return b.checkRet(r2, "zeltun_set_tun_behavior")
}

func (b *zeltunBridge) SetRules(mode string, apps []string) error {
	csv := strings.Join(apps, ",")
	cB, cP := cstrBytes(csv)
	r, _, _ := b.procSetRules.Call(uintptr(zeltunSplitModeByte(mode)), cP)
	runtime.KeepAlive(cB)
	return b.checkRet(r, "zeltun_set_rules")
}

func (b *zeltunBridge) SetSocks(socksAddr string) error {
	sB, sP := cstrBytes(socksAddr)
	r, _, _ := b.procSetSocks.Call(sP)
	runtime.KeepAlive(sB)
	return b.checkRet(r, "zeltun_set_socks")
}

func (b *zeltunBridge) UpdatePhysicalIf(ifIdx int, gw, lanIP string) error {
	gB, gP := cstrBytes(gw)
	lB, lP := cstrBytes(lanIP)
	r, _, _ := b.procUpdatePhysIf.Call(uintptr(uint32(ifIdx)), gP, lP)
	runtime.KeepAlive(gB)
	runtime.KeepAlive(lB)
	return b.checkRet(r, "zeltun_update_physical_if")
}

func (b *zeltunBridge) ClearBypassIPs() error {
	r, _, _ := b.procClearBypassIps.Call()
	return b.checkRet(r, "zeltun_clear_bypass_ips")
}

func (b *zeltunBridge) AddBypassIP(ip string) error {
	iB, iP := cstrBytes(ip)
	r, _, _ := b.procAddBypassIp.Call(iP)
	runtime.KeepAlive(iB)
	return b.checkRet(r, "zeltun_add_bypass_ip")
}

func (b *zeltunBridge) Start(socksAddr string, physIfIndex uint32, ringMB int) error {
	sB, sP := cstrBytes(socksAddr)
	ringCap := uint32(ringMB) * 1024 * 1024
	r, _, _ := b.procStart.Call(sP, uintptr(physIfIndex), uintptr(ringCap))
	runtime.KeepAlive(sB)
	return b.checkRet(r, "zeltun_start")
}

func (b *zeltunBridge) Stop() error {
	r, _, _ := b.procStop.Call()
	return b.checkRet(r, "zeltun_stop")
}

func (b *zeltunBridge) GetStatsEx() (ZeltunStats, error) {
	var st ZeltunStats
	r, _, _ := b.procGetStatsEx.Call(uintptr(unsafe.Pointer(&st)))
	runtime.KeepAlive(&st)
	if err := b.checkRet(r, "zeltun_get_stats_ex"); err != nil {
		return ZeltunStats{}, err
	}
	return st, nil
}

func (b *zeltunBridge) CleanupStale(adapterName, tunGW string) {
	nB, nP := cstrBytes(adapterName)
	gB, gP := cstrBytes(tunGW)
	_, _, _ = b.procCleanupStale.Call(nP, gP)
	runtime.KeepAlive(nB)
	runtime.KeepAlive(gB)
}

