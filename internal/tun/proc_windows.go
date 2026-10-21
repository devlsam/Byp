package tun

import (
	"encoding/binary"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modiphlpapi             = windows.NewLazySystemDLL("iphlpapi.dll")
	procGetExtendedTcpTable = modiphlpapi.NewProc("GetExtendedTcpTable")
	procGetExtendedUdpTable = modiphlpapi.NewProc("GetExtendedUdpTable")

	modkernel32                    = windows.NewLazySystemDLL("kernel32.dll")
	procQueryFullProcessImageNameW = modkernel32.NewProc("QueryFullProcessImageNameW")
)

const (
	tcpTableOwnerPidAll = 5
	udpTableOwnerPid    = 1
	afInet              = 2  // AF_INET
	afInet6             = 23 // AF_INET6
)

type ProcessAppInfo struct {
	PID  uint32 `json:"pid"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type cachedProcess struct {
	path      string
	name      string
	expiresAt int64
}

type cachedPortEntry struct {
	exeName   string
	exePath   string
	pid       uint32
	expiresAt int64
}

const (
	tcpStateClosed    = 1
	tcpStateTimeWait  = 11
	tcpStateDeleteTCB = 12
)

var (
	procCache sync.Map // map[uint32]cachedProcess

	portCacheMu       sync.RWMutex
	portCache         = make(map[uint32]cachedPortEntry, 2048)
	tcpPortTable      = make(map[uint16]uint32, 2048)
	udpPortTable      = make(map[uint16]uint32, 1024)
	lastTCPTableFetch int64
	lastUDPTableFetch int64
	tableRefreshMu    sync.Mutex

	tableBufPool = sync.Pool{
		New: func() any {
			b := make([]byte, 131072) // 128KB initial capacity to avoid 2nd syscall
			return &b
		},
	}

	pathBufPool = sync.Pool{
		New: func() any {
			b := make([]uint16, windows.MAX_PATH*2)
			return &b
		},
	}
)

func getProcessImage(pid uint32) (string, string) {
	if pid == 0 || pid == 4 {
		return "System", "System"
	}

	nowNano := time.Now().UnixNano()
	if val, ok := procCache.Load(pid); ok {
		cp := val.(cachedProcess)
		if nowNano < cp.expiresAt {
			return cp.path, cp.name
		}
		procCache.Delete(pid)
	}

	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		// Negative cache protected/inaccessible processes for 30s to avoid repeated OpenProcess syscalls
		procCache.Store(pid, cachedProcess{
			path:      "",
			name:      "",
			expiresAt: nowNano + int64(30*time.Second),
		})
		return "", ""
	}
	defer windows.CloseHandle(handle)

	bufPtr := pathBufPool.Get().(*[]uint16)
	defer pathBufPool.Put(bufPtr)
	buf := *bufPtr

	size := uint32(len(buf))
	r1, _, _ := procQueryFullProcessImageNameW.Call(
		uintptr(handle),
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
	)
	if r1 == 0 {
		procCache.Store(pid, cachedProcess{
			path:      "",
			name:      "",
			expiresAt: nowNano + int64(30*time.Second),
		})
		return "", ""
	}

	fullPath := syscall.UTF16ToString(buf[:size])
	baseName := filepath.Base(fullPath)

	procCache.Store(pid, cachedProcess{
		path:      fullPath,
		name:      baseName,
		expiresAt: nowNano + int64(60*time.Second),
	})

	return fullPath, baseName
}

// querySocketTable fetches the Windows TCP or UDP table in a SINGLE syscall whenever possible,
// with bOrder = 0 (no kernel sorting overhead).
func querySocketTable(proc *windows.LazyProc, family uintptr, tableClass uintptr) (*[]byte, uint32) {
	bufPtr := tableBufPool.Get().(*[]byte)
	size := uint32(cap(*bufPtr))
	buf := (*bufPtr)[:size]

	// 1st attempt: Pass pre-allocated buffer directly with bOrder = 0 (unsorted)
	r1, _, _ := proc.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		0, // bOrder = false (CRITICAL: prevents O(N log N) kernel table sorting!)
		family,
		tableClass,
		0,
	)

	if r1 == uintptr(windows.ERROR_INSUFFICIENT_BUFFER) && size > 0 {
		*bufPtr = make([]byte, size+16384)
		size = uint32(cap(*bufPtr))
		buf = (*bufPtr)[:size]
		r1, _, _ = proc.Call(
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(&size)),
			0,
			family,
			tableClass,
			0,
		)
	}

	if r1 != 0 || size < 4 {
		tableBufPool.Put(bufPtr)
		return nil, 0
	}

	return bufPtr, size
}

// ClearPortCache flushes cached process and port tables.
func ClearPortCache() {
	portCacheMu.Lock()
	portCache = make(map[uint32]cachedPortEntry, 2048)
	tcpPortTable = make(map[uint16]uint32, 2048)
	udpPortTable = make(map[uint16]uint32, 1024)
	lastTCPTableFetch = 0
	lastUDPTableFetch = 0
	portCacheMu.Unlock()
}

// refreshTCPTableSnapshot loads active TCP ports atomically.
func refreshTCPTableSnapshot() {
	newTable := make(map[uint16]uint32, 2048)

	// 1. IPv4 TCP Table (sizeof(MIB_TCPROW_OWNER_PID) = 24)
	if bufPtr, size := querySocketTable(procGetExtendedTcpTable, afInet, tcpTableOwnerPidAll); bufPtr != nil {
		buf := (*bufPtr)[:size]
		numEntries := binary.LittleEndian.Uint32(buf[0:4])
		offset := 4
		const rowSize = 24
		for i := uint32(0); i < numEntries && offset+rowSize <= len(buf); i++ {
			row := buf[offset : offset+rowSize]
			state := binary.LittleEndian.Uint32(row[0:4])
			if state != tcpStateClosed && state != tcpStateTimeWait && state != tcpStateDeleteTCB {
				localPort := binary.BigEndian.Uint16(row[8:10])
				pid := binary.LittleEndian.Uint32(row[20:24])
				if localPort > 0 && pid > 0 {
					newTable[localPort] = pid
				}
			}
			offset += rowSize
		}
		tableBufPool.Put(bufPtr)
	}

	// 2. IPv6 Dual-Stack TCP Table (sizeof(MIB_TCP6ROW_OWNER_PID) = 56)
	if bufPtr, size := querySocketTable(procGetExtendedTcpTable, afInet6, tcpTableOwnerPidAll); bufPtr != nil {
		buf := (*bufPtr)[:size]
		numEntries := binary.LittleEndian.Uint32(buf[0:4])
		offset := 4
		const rowSize = 56
		for i := uint32(0); i < numEntries && offset+rowSize <= len(buf); i++ {
			row := buf[offset : offset+rowSize]
			state := binary.LittleEndian.Uint32(row[48:52])
			if state != tcpStateClosed && state != tcpStateTimeWait && state != tcpStateDeleteTCB {
				localPort := binary.BigEndian.Uint16(row[20:22])
				pid := binary.LittleEndian.Uint32(row[52:56])
				if localPort > 0 && pid > 0 {
					if _, exists := newTable[localPort]; !exists {
						newTable[localPort] = pid
					}
				}
			}
			offset += rowSize
		}
		tableBufPool.Put(bufPtr)
	}

	tcpPortTable = newTable
}

// refreshUDPTableSnapshot loads active UDP ports atomically.
func refreshUDPTableSnapshot() {
	newTable := make(map[uint16]uint32, 1024)

	// 1. IPv4 UDP Table (sizeof(MIB_UDPROW_OWNER_PID) = 12)
	if bufPtr, size := querySocketTable(procGetExtendedUdpTable, afInet, udpTableOwnerPid); bufPtr != nil {
		buf := (*bufPtr)[:size]
		numEntries := binary.LittleEndian.Uint32(buf[0:4])
		offset := 4
		const rowSize = 12
		for i := uint32(0); i < numEntries && offset+rowSize <= len(buf); i++ {
			row := buf[offset : offset+rowSize]
			localPort := binary.BigEndian.Uint16(row[4:6])
			pid := binary.LittleEndian.Uint32(row[8:12])
			if localPort > 0 && pid > 0 {
				newTable[localPort] = pid
			}
			offset += rowSize
		}
		tableBufPool.Put(bufPtr)
	}

	// 2. IPv6 Dual-Stack UDP Table (sizeof(MIB_UDP6ROW_OWNER_PID) = 28)
	if bufPtr, size := querySocketTable(procGetExtendedUdpTable, afInet6, udpTableOwnerPid); bufPtr != nil {
		buf := (*bufPtr)[:size]
		numEntries := binary.LittleEndian.Uint32(buf[0:4])
		offset := 4
		const rowSize = 28
		for i := uint32(0); i < numEntries && offset+rowSize <= len(buf); i++ {
			row := buf[offset : offset+rowSize]
			localPort := binary.BigEndian.Uint16(row[20:22])
			pid := binary.LittleEndian.Uint32(row[24:28])
			if localPort > 0 && pid > 0 {
				if _, exists := newTable[localPort]; !exists {
					newTable[localPort] = pid
				}
			}
			offset += rowSize
		}
		tableBufPool.Put(bufPtr)
	}

	udpPortTable = newTable
}

func lookupSocketPID(isUDP bool, port uint16) uint32 {
	portCacheMu.RLock()
	defer portCacheMu.RUnlock()
	if isUDP {
		return udpPortTable[port]
	}
	return tcpPortTable[port]
}

func lookupOrRefreshSocketPID(isUDP bool, port uint16, minInterval time.Duration) uint32 {
	if pid := lookupSocketPID(isUDP, port); pid != 0 {
		return pid
	}

	tableRefreshMu.Lock()
	defer tableRefreshMu.Unlock()

	if pid := lookupSocketPID(isUDP, port); pid != 0 {
		return pid
	}

	now := time.Now().UnixNano()
	minIntervalNs := int64(minInterval)

	portCacheMu.Lock()
	defer portCacheMu.Unlock()

	if isUDP {
		if now-lastUDPTableFetch >= minIntervalNs {
			refreshUDPTableSnapshot()
			lastUDPTableFetch = now
		}
		return udpPortTable[port]
	}

	if now-lastTCPTableFetch >= minIntervalNs {
		refreshTCPTableSnapshot()
		lastTCPTableFetch = now
	}
	return tcpPortTable[port]
}

func ResolveProcessByPort(network string, srcPort uint16) (exeName string, exePath string, pid uint32) {
	if srcPort == 0 {
		return "", "", 0
	}

	isUDP := strings.Contains(strings.ToLower(network), "udp")
	var isUDPBit uint32
	if isUDP {
		isUDPBit = 1
	}
	cacheKey := (isUDPBit << 16) | uint32(srcPort)
	now := time.Now().UnixNano()

	portCacheMu.RLock()
	entry, found := portCache[cacheKey]
	if found && now < entry.expiresAt {
		portCacheMu.RUnlock()
		return entry.exeName, entry.exePath, entry.pid
	}
	portCacheMu.RUnlock()

	cachedPID := lookupOrRefreshSocketPID(isUDP, srcPort, 25*time.Millisecond)
	if cachedPID == 0 {
		time.Sleep(5 * time.Millisecond)
		cachedPID = lookupOrRefreshSocketPID(isUDP, srcPort, 0)
	}

	if cachedPID == 0 {
		portCacheMu.Lock()
		portCache[cacheKey] = cachedPortEntry{
			expiresAt: now + int64(300*time.Millisecond),
		}
		portCacheMu.Unlock()
		return "", "", 0
	}

	exePath, exeName = getProcessImage(cachedPID)

	portCacheMu.Lock()
	if len(portCache) > 4096 {
		for k, v := range portCache {
			if now >= v.expiresAt {
				delete(portCache, k)
			}
		}
	}
	portCache[cacheKey] = cachedPortEntry{
		exeName:   exeName,
		exePath:   exePath,
		pid:       cachedPID,
		expiresAt: now + int64(3*time.Second),
	}
	portCacheMu.Unlock()

	return exeName, exePath, cachedPID
}

func GetRunningProcesses() ([]ProcessAppInfo, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to create process snapshot: %w", err)
	}
	defer windows.CloseHandle(snapshot)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	err = windows.Process32First(snapshot, &entry)
	if err != nil {
		return nil, fmt.Errorf("failed to get first process: %w", err)
	}

	seen := make(map[string]bool)
	var apps []ProcessAppInfo

	for {
		pid := entry.ProcessID
		name := syscall.UTF16ToString(entry.ExeFile[:])

		if pid > 4 && strings.HasSuffix(strings.ToLower(name), ".exe") {
			lowerName := strings.ToLower(name)
			if !isSystemProcess(lowerName) && !seen[lowerName] {
				fullPath, _ := getProcessImage(pid)
				if fullPath == "" {
					fullPath = name
				}
				seen[lowerName] = true
				apps = append(apps, ProcessAppInfo{
					PID:  pid,
					Name: name,
					Path: fullPath,
				})
			}
		}

		err = windows.Process32Next(snapshot, &entry)
		if err != nil {
			break
		}
	}

	sort.Slice(apps, func(i, j int) bool {
		return strings.ToLower(apps[i].Name) < strings.ToLower(apps[j].Name)
	})

	return apps, nil
}

func isSystemProcess(name string) bool {
	switch name {
	case "smss.exe", "csrss.exe", "wininit.exe", "services.exe", "lsass.exe",
		"fontdrvhost.exe", "winlogon.exe", "dwm.exe", "sihost.exe",
		"taskhostw.exe", "runtimebroker.exe", "svchost.exe", "explorer.exe":
		return true
	default:
		return false
	}
}
