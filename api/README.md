# Vision 23: Auto-Discovery Service

The `api/` directory contains backend helper endpoints for host-level networking, interface detection, and device auto-discovery.

---

## 1. Overview

`discover.php` runs on the local web server (Apache/PHP via XAMPP) to automatically detect ESP32-CAM and ESP32 Telemetry nodes operating on the local subnet without requiring hardcoded static IP configurations.

---

## 2. How Auto-Discovery Works

1. **ARP Cache Inspection**: Executes `arp -a` via PHP's `exec()` to parse IP-to-MAC address mapping tables across all network interfaces.
2. **Espressif OUI Filtering**: Matches MAC address prefixes belonging to Espressif Systems hardware:
   - `30:76:f5`, `b4:bf:e9`, `24:0a:c4`, `48:e7:29`, `dc:54:75`, `ac:67:b2`, `a4:cf:12`
3. **Known Subnet & Node Matching**: Identifies designated camera nodes (ending in `.152`) and telemetry nodes (ending in `.74`).
4. **JSON Response**: Formats and returns the active IP addresses, video stream URLs, and WebSocket endpoints directly to the frontend.

---

## 3. Testing the Endpoint

### Via Web Browser or cURL:
```bash
curl http://localhost/robot-nav/api/discover.php
```

### Via CLI:
```bash
php api/discover.php
```

---

## 4. Requirements

- PHP 7.4 or PHP 8.x
- `exec()` function enabled in `php.ini` (standard default in XAMPP)
- Host OS: Windows, Linux, or macOS with standard `arp` utility
