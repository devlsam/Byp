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
	Name string `json:"name"` // e.g. "discord.exe"
	Path string `json:"path"` // e.g. "C:\Users\...\discord.exe"
}

type cachedProcess struct {
	path      string
	name      string
	expiresAt time.Time
}

type cachedPortEntry struct {
	exeName   string
	exePath   string
	pid       uint32
	expiresAt int64 // UnixNano for ultra-fast lock-free comparisons
}

var (
	procCache sync.Map // map[uint32]cachedProcess

	portCacheMu sync.RWMutex
	portCache   = make(map[uint32]cachedPortEntry, 256) // key: (isUDP << 16) | srcPort

	// tableBufPool reuses byte slices to eliminate heap allocations on kernel socket queries
	tableBufPool = sync.Pool{
		New: func() any {
			b := make([]byte, 65536) // 64KB standard initial capacity
			return &b
		},
	}

	// pathBufPool reuses UTF16 buffers for process image queries
	pathBufPool = sync.Pool{
		New: func() any {
			b := make([]uint16, windows.MAX_PATH*2)
			return &b
		},
	}
)

// getProcessImage returns the full executable path and base name for a given PID.
// Results are cached in memory with a 60-second TTL to eliminate redundant syscalls.
func getProcessImage(pid uint32) (string, string) {
	if pid == 0 || pid == 4 {
		return "System", "System"
	}

	if val, ok := procCache.Load(pid); ok {
		cp := val.(cachedProcess)
		if time.Now().Before(cp.expiresAt) {
			return cp.path, cp.name
		}
		procCache.Delete(pid)
	}

	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
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
		return "", ""
	}

	fullPath := syscall.UTF16ToString(buf[:size])
	baseName := filepath.Base(fullPath)

	procCache.Store(pid, cachedProcess{
		path:      fullPath,
		name:      baseName,
		expiresAt: time.Now().Add(60 * time.Second),
	})

	return fullPath, baseName
}

// findTCPProcessByPort scans the Windows TCP table using a pooled buffer with zero allocations.
func findTCPProcessByPort(srcPort uint16) uint32 {
	var size uint32
	// 1. Get required buffer size
	r1, _, _ := procGetExtendedTcpTable.Call(
		0,
		uintptr(unsafe.Pointer(&size)),
		1, // bOrder = true
		uintptr(afInet),
		uintptr(tcpTableOwnerPidAll),
		0,
	)
	if size == 0 {
		return 0
	}

	bufPtr := tableBufPool.Get().(*[]byte)
	defer tableBufPool.Put(bufPtr)

	if uint32(cap(*bufPtr)) < size {
		*bufPtr = make([]byte, size+4096)
	}
	buf := (*bufPtr)[:size]

	r1, _, _ = procGetExtendedTcpTable.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		1,
		uintptr(afInet),
		uintptr(tcpTableOwnerPidAll),
		0,
	)
	if r1 != 0 {
		return 0
	}

	numEntries := binary.LittleEndian.Uint32(buf[0:4])
	offset := 4
	rowSize := 24 // sizeof(MIB_TCPROW_OWNER_PID)

	for i := uint32(0); i < numEntries; i++ {
		if offset+rowSize > len(buf) {
			break
		}
		row := buf[offset : offset+rowSize]
		localPort := binary.BigEndian.Uint16(row[8:10])
		if localPort == srcPort {
			return binary.LittleEndian.Uint32(row[20:24])
		}
		offset += rowSize
	}

	return 0
}

// findUDPProcessByPort scans the Windows UDP table using a pooled buffer with zero allocations.
func findUDPProcessByPort(srcPort uint16) uint32 {
	var size uint32
	r1, _, _ := procGetExtendedUdpTable.Call(
		0,
		uintptr(unsafe.Pointer(&size)),
		1,
		uintptr(afInet),
		uintptr(udpTableOwnerPid),
		0,
	)
	if size == 0 {
		return 0
	}

	bufPtr := tableBufPool.Get().(*[]byte)
	defer tableBufPool.Put(bufPtr)

	if uint32(cap(*bufPtr)) < size {
		*bufPtr = make([]byte, size+4096)
	}
	buf := (*bufPtr)[:size]

	r1, _, _ = procGetExtendedUdpTable.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
		1,
		uintptr(afInet),
		uintptr(udpTableOwnerPid),
		0,
	)
	if r1 != 0 {
		return 0
	}

	numEntries := binary.LittleEndian.Uint32(buf[0:4])
	offset := 4
	rowSize := 12 // sizeof(MIB_UDPROW_OWNER_PID)

	for i := uint32(0); i < numEntries; i++ {
		if offset+rowSize > len(buf) {
			break
		}
		row := buf[offset : offset+rowSize]
		localPort := binary.BigEndian.Uint16(row[4:6])
		if localPort == srcPort {
			return binary.LittleEndian.Uint32(row[8:12])
		}
		offset += rowSize
	}

	return 0
}

// ResolveProcessByPort resolves the process name and path from source port and protocol.
// Employs a blazing fast primitive uint32-keyed LRU/TTL cache to eliminate repeated Windows table scans.
func ResolveProcessByPort(network string, srcPort uint16) (exeName string, exePath string, pid uint32) {
	if srcPort == 0 {
		return "", "", 0
	}

	var isUDPBit uint32
	if strings.Contains(strings.ToLower(network), "udp") {
		isUDPBit = 1
	}
	cacheKey := (isUDPBit << 16) | uint32(srcPort)
	nowNano := time.Now().UnixNano()

	// 1. Fast path: Read-lock check on portCache
	portCacheMu.RLock()
	entry, found := portCache[cacheKey]
	portCacheMu.RUnlock()

	if found && nowNano < entry.expiresAt {
		return entry.exeName, entry.exePath, entry.pid
	}

	// 2. Slow path: Query OS table
	if isUDPBit == 1 {
		pid = findUDPProcessByPort(srcPort)
	} else {
		pid = findTCPProcessByPort(srcPort)
	}

	if pid == 0 {
		return "", "", 0
	}

	exePath, exeName = getProcessImage(pid)

	// 3. Cache the resolved port mapping for 10 seconds
	portCacheMu.Lock()
	if len(portCache) > 1024 {
		for k, v := range portCache {
			if nowNano >= v.expiresAt {
				delete(portCache, k)
			}
		}
	}
	portCache[cacheKey] = cachedPortEntry{
		exeName:   exeName,
		exePath:   exePath,
		pid:       pid,
		expiresAt: nowNano + int64(10*time.Second),
	}
	portCacheMu.Unlock()

	return exeName, exePath, pid
}

// GetRunningProcesses returns a list of distinct active Windows application processes
// that can be added to the Whitelist/Blacklist in the UI.
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
			// Ignore common system/idle processes that users shouldn't split-tunnel
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
