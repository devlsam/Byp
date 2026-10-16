package sysutil

import (
	"runtime/debug"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modkernel32                  = windows.NewLazySystemDLL("kernel32.dll")
	procSetProcessWorkingSetSize = modkernel32.NewProc("SetProcessWorkingSetSize")
)

// TrimProcessMemory instructs the Windows kernel to immediately flush unused physical
// RAM pages out of physical memory for both the main process and all child WebView2 processes.
func TrimProcessMemory() {
	// 1. Force Go runtime to release unmapped memory pages back to the OS
	debug.FreeOSMemory()

	// 2. Trim working set of current main process
	trimHandle(windows.CurrentProcess())

	// 3. Find and trim all child processes (WebView2 browser, GPU, and renderer processes)
	currentPID := windows.GetCurrentProcessId()
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return
	}
	defer windows.CloseHandle(snapshot)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	if err := windows.Process32First(snapshot, &entry); err != nil {
		return
	}

	for {
		if entry.ParentProcessID == currentPID {
			// Found a child process (msedgewebview2.exe)
			const PROCESS_SET_QUOTA = 0x0100
			hChild, err := windows.OpenProcess(PROCESS_SET_QUOTA|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, entry.ProcessID)
			if err == nil {
				trimHandle(hChild)
				_ = windows.CloseHandle(hChild)
			}
		}

		if err := windows.Process32Next(snapshot, &entry); err != nil {
			break
		}
	}
}

func trimHandle(h windows.Handle) {
	// (SIZE_T)-1 temporarily trims the working set of the process to zero,
	// swapping out non-active pages to minimize RAM usage to the absolute lowest footprint.
	_, _, _ = procSetProcessWorkingSetSize.Call(uintptr(h), ^uintptr(0), ^uintptr(0))
}
