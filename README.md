<div align="center">
  <img src="assets/logo.svg" alt="Byp" width="96" height="96" />
  <h1>Byp</h1>
  <p>
    <b>High-performance V2Ray and Xray desktop client for Windows with interactive process-level split tunneling.</b>
  </p>

  <p>
    <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0f172a?style=flat-square&logo=windows&logoColor=white" alt="Platform" />
    <img src="https://img.shields.io/badge/runtime-Go%20%2B%20Wails-0f172a?style=flat-square&logo=go&logoColor=white" alt="Stack" />
    <img src="https://img.shields.io/badge/engine-Xray--core%20%2B%20Wintun-0f172a?style=flat-square" alt="Engine" />
    <img src="https://img.shields.io/badge/memory-~40MB-0f172a?style=flat-square" alt="Memory" />
    <img src="https://img.shields.io/badge/license-MIT-0f172a?style=flat-square" alt="License" />
  </p>

  <p>
    <a href="#overview">Overview</a> •
    <a href="#process-level-split-tunneling">Split Tunneling</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#comparison">Comparison</a> •
    <a href="#installation">Installation</a> •
    <a href="#faq">FAQ</a> •
    <a href="#contact">Contact</a>
  </p>
</div>

---

## Overview

<div align="center">
  <img src="assets/demo.gif" alt="Byp V2Ray Xray Split Tunneling Demo" width="540" />
</div>

<br/>

Finding a **V2Ray or Xray client with reliable split tunneling on Windows** has historically forced users into a difficult compromise: either run in System Proxy mode—which is completely ignored by UDP-based applications like Discord Voice and online games—or enable a global TUN adapter that hijacks 100% of system traffic, degrading local gaming ping and throttling domestic downloads.

**Byp** solves this at the Windows process level. It embeds `xray-core` and `tun2socks` directly into a single native Go executable (`byp.exe`) and pairs them with an interactive, graph-based routing topology. Instead of configuring external tools like Proxifier or writing complex JSON routing rules, you visually wire specific `.exe` applications to either the **VPN Tunnel** or **Direct Internet** in real time.

---

## Process-Level Split Tunneling

Rather than burying per-application routing logic inside nested configuration menus, Byp exposes the Windows network stack as a live visual flow:

- **Default System Policy (`My System`):** Controls the baseline route for all unmatched Windows traffic. Connecting `My System` to **Direct Internet** while wiring specific executables to **VPN Tunnel** creates an instant per-app whitelist without touching the rest of your operating system.
- **One-Click Application Presets:** Immediately route UDP-heavy and latency-sensitive applications such as `Discord.exe`, `Telegram.exe`, `Chrome.exe`, and `Steam.exe`.
- **Live Process Discovery:** Attach currently running Windows processes directly from memory (`+ Running Apps`) or browse any executable on disk (`+ Add .exe`).
- **Update-Resilient Executable Matching:** Process rules evaluate against base executable names across child processes, ensuring applications like Discord continue to route properly even after auto-updating into new versioned directories (`app-1.0.9xxx`).
- **Zero-Restart Route Switching:** Flipping an application between the encrypted tunnel and your physical ISP gateway takes effect immediately on new socket connections without restarting the core.

---

## Architecture

Conventional user-space per-app VPN wrappers struggle with multiplayer games and WebRTC voice streams because those applications open hundreds of ephemeral TCP and UDP ports per second. Byp eliminates per-packet inspection overhead by resolving process ownership strictly at the socket establishment boundary:

1. **Exact Source-Port Attribution (`iphlpapi.dll`):** When a packet enters the `Wintun` Layer-3 virtual adapter, Byp reads the original source port directly from the `tun2socks` gVisor netstack prior to NAT translation and queries the Windows kernel socket tables (`GetExtendedTcpTable` and `GetExtendedUdpTable`) to identify the owning `PID`.
2. **Lock-Free PID Caching:** Executable paths are resolved once via `QueryFullProcessImageNameW` during the initial connection handshake and stored in a concurrent `sync.Map`. Subsequent data packets flow at wire speed with near-zero CPU overhead.
3. **Hardware Interface Binding (`IP_UNICAST_IF`):** Traffic assigned to **Direct Internet** is bound directly to your physical network card's `InterfaceIndex` (Wi-Fi or Ethernet) at Layer 3 using `setsockopt(..., IP_UNICAST_IF)`, completely eliminating routing loops back into the virtual TUN interface.
4. **Isolated DNS Resolution:** DNS queries (`Port 53`) are routed transparently to prevent ISP DNS poisoning from breaking WebRTC voice handshakes or causing Discord `RTC Connecting` / `No Route` errors.

---

## Core Capabilities

- **In-Memory Single Binary:** Both `xray-core` and `tun2socks` execute natively in memory within the Go runtime. No background CLI subprocesses or console windows are spawned.
- **Minimal Resource Footprint (~40 MB RAM):** Built with Wails v3 and native Windows Edge WebView2 rather than bundling a 300 MB+ Electron/Chromium runtime.
- **Complete Protocol & Subscription Support:** Supports `VLESS` (`XTLS-Reality`, `XTLS-Vision`), `VMess`, `Trojan`, and `Shadowsocks` over `TCP`, `WebSocket (WS)`, `gRPC`, `HTTPUpgrade`, and `SplitHTTP`, alongside automated Base64 subscription management.
- **Crash-Safe Network Teardown:** Registers OS signal hooks and shutdown handlers to flush static routing tables, release the Wintun adapter, and restore Windows Registry proxy settings cleanly upon exit.

---

## Comparison

| Capability | Byp | v2rayN | NekoRay / NekoBox | Proxifier + Xray |
| :--- | :--- | :--- | :--- | :--- |
| **Per-App `.exe` Split Tunneling** | Interactive visual graph | Nested text menus | Manual routing rules | Commercial external app |
| **Discord Voice (UDP / WebRTC)** | Built-in 1-click preset | Manual TUN tuning | Manual process rules | Manual port & rule setup |
| **Bypass Specific Games on TUN** | Direct NIC socket binding | Complex route rules | Complex route rules | Not a tunnel client |
| **Core Execution Model** | In-memory Go library | External `.exe` subprocess | External core subprocess | Requires two separate apps |
| **Idle Memory Footprint** | ~35 – 55 MB | ~90 – 140 MB | ~110 – 160 MB | ~120 MB+ |
| **Resilient to App Auto-Updates** | Matches base `.exe` name | Often breaks on path change | Manual maintenance | Supported |

---

## Installation

1. Download the latest `byp.exe` binary from the [Releases](../../releases) page.
2. Run the executable as **Administrator** (required by Windows to initialize the `Wintun` Layer-3 virtual adapter and configure interface metrics).

> **Note on Windows SmartScreen:** Because Byp is an independent open-source project and does not use a commercial code-signing certificate, Windows Defender SmartScreen may display a warning on first launch. Click **More info** and **Run anyway** to proceed, or compile the binary yourself from source below.

### Building from Source

Prerequisites: **Go 1.25+**, **Node.js 22+**, and **Wails CLI v3**.

    git clone https://github.com/YOUR_USERNAME/byp.git
    cd byp

    go mod tidy

    wails3 build -clean -s

The compiled executable will be generated at `build/bin/byp.exe`.

---

## Roadmap

- [x] In-memory `xray-core` and `tun2socks` (Wintun) single-binary architecture
- [x] Interactive process-level split tunneling topology for `.exe` applications
- [x] Live Windows process scanner and one-click application presets
- [x] Layer-3 physical interface binding (`IP_UNICAST_IF`) for loop-free bypass
- [ ] Domain and GeoIP routing nodes inside the visual topology view
- [ ] Real-time per-application bandwidth and latency telemetry
- [ ] Savable routing profiles (Gaming, Work, Full Tunnel)

---

## FAQ

<details>
<summary><b>What is the best V2Ray / Xray client with split tunneling for Windows?</b></summary>
<br/>
<b>Byp</b> is purpose-built for per-application split tunneling on Windows. Unlike traditional clients that require complex JSON rules to separate app traffic, Byp provides an interactive visual graph where you can route specific <code>.exe</code> processes (such as Discord, Telegram, or web browsers) through an Xray TUN tunnel while keeping online games and local Windows traffic on your direct ISP connection.
</details>

<details>
<summary><b>How do I tunnel only Discord (including UDP Voice) without routing my whole PC?</b></summary>
<br/>
Open the <b>Split Tunneling</b> tab in Byp, connect the <code>My System</code> node to <b>Direct Internet</b>, and click the <code>Discord.exe</code> preset to wire it to <b>VPN Tunnel</b>. Byp captures Discord's TCP and UDP WebRTC voice streams at Layer 3 (fixing <i>RTC Connecting</i> issues) while leaving your games and other applications on your local internet.
</details>

<details>
<summary><b>Can Byp replace Proxifier for V2Ray and Xray routing?</b></summary>
<br/>
Yes. Byp natively integrates kernel-level source-port PID matching with a Layer-3 Wintun adapter and an embedded Xray core, eliminating the need to purchase or configure third-party tools like Proxifier.
</details>

<details>
<summary><b>Why does Byp require Administrator privileges?</b></summary>
<br/>
Creating a Layer-3 virtual network interface (via the <code>Wintun</code> driver) and binding sockets directly to physical network interfaces require administrative privileges on Windows 10 and 11.
</details>

<details>
<summary><b>Do application updates break existing split-tunneling rules?</b></summary>
<br/>
No. Applications like Discord install updates into new versioned folders (such as <code>app-1.0.9xxx</code>). Byp evaluates routing rules against the base executable name (<code>Discord.exe</code>) across all child processes, so updates never invalidate your setup.
</details>

---

## Search Keywords & Topics

`v2ray client with split tunneling` · `xray windows client` · `per-app vpn split tunnel windows` · `vless reality client` · `discord voice vpn split tunnel` · `tun2socks per process routing` · `proxifier alternative for xray` · `wails golang desktop vpn`

---

## Contact & Community

Have questions, feature requests, or want to collaborate on **Byp**? Feel free to reach out directly:

- **Author / Maintainer:** Amosami
- **Discord:** `amosami`
- **Bug Reports & Feature Requests:** [GitHub Issues](../../issues)

If **Byp** improved your workflow or gaming ping, please consider giving this repository a **Star** at the top right of the page so more developers and users can find it.

---

## License

Released under the (LICENSE).