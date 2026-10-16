package sysproxy

import (
	"fmt"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

const (
	INTERNET_OPTION_SETTINGS_CHANGED = 39
	INTERNET_OPTION_REFRESH          = 37
)

var (
	modWinInet                = syscall.NewLazyDLL("wininet.dll")
	procInternetSetOption     = modWinInet.NewProc("InternetSetOptionW")
	modKernel32               = syscall.NewLazyDLL("kernel32.dll")
	procSetConsoleCtrlHandler = modKernel32.NewProc("SetConsoleCtrlHandler")
	proxyMu                   sync.Mutex
)

func init() {
	// Automatically register a handler for Windows exit/logoff/shutdown events
	// so the Windows system proxy is disabled before the process terminates.
	if procSetConsoleCtrlHandler.Find() == nil {
		cb := syscall.NewCallback(func(ctrlType uint32) uintptr {
			_ = ClearProxy()
			return 0
		})
		_, _, _ = procSetConsoleCtrlHandler.Call(cb, 1)
	}
}

// SetProxy enables the Windows system proxy pointing to 127.0.0.1:port
func SetProxy(httpPort int) error {
	proxyMu.Lock()
	defer proxyMu.Unlock()

	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("failed to open registry key: %w", err)
	}
	defer k.Close()

	proxyServer := fmt.Sprintf("127.0.0.1:%d", httpPort)
	proxyOverride := "localhost;127.*;10.*;172.16.*;192.168.*;<local>"

	if err := k.SetDWordValue("ProxyEnable", 1); err != nil {
		return fmt.Errorf("failed to set ProxyEnable: %w", err)
	}
	if err := k.SetStringValue("ProxyServer", proxyServer); err != nil {
		return fmt.Errorf("failed to set ProxyServer: %w", err)
	}
	if err := k.SetStringValue("ProxyOverride", proxyOverride); err != nil {
		return fmt.Errorf("failed to set ProxyOverride: %w", err)
	}

	refreshWinInet()
	return nil
}

// ClearProxy disables the Windows system proxy
func ClearProxy() error {
	proxyMu.Lock()
	defer proxyMu.Unlock()

	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("failed to open registry key: %w", err)
	}
	defer k.Close()

	_ = k.SetDWordValue("ProxyEnable", 0)

	refreshWinInet()
	return nil
}

// refreshWinInet triggers InternetSetOptionW (39 & 37) so system settings apply immediately
func refreshWinInet() {
	if procInternetSetOption.Find() == nil {
		_, _, _ = procInternetSetOption.Call(0, uintptr(INTERNET_OPTION_SETTINGS_CHANGED), 0, 0)
		_, _, _ = procInternetSetOption.Call(0, uintptr(INTERNET_OPTION_REFRESH), 0, 0)
	}
}

// IsProxyEnabled checks if the system proxy is currently set to enabled
func IsProxyEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	val, _, err := k.GetIntegerValue("ProxyEnable")
	if err != nil {
		return false
	}
	return val == 1
}

// Prevent unused import warnings
var _ = unsafe.Pointer(nil)
