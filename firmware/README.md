# Vision 23: ESP32 Firmware Guide

This directory contains the embedded C++ / Arduino firmware for the **Vision 23 / Nav-Bot** hardware subsystem.

---

## 1. Prerequisites & Board Support

1. Install the latest [Arduino IDE](https://www.arduino.cc/en/software) (2.x or 1.8.x).
2. Open **File** > **Preferences** and add the following URL to **Additional Boards Manager URLs**:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Open **Tools** > **Board** > **Boards Manager**, search for `esp32` by Espressif Systems, and click **Install** (v2.0.11 or later recommended).

---

## 2. Arduino IDE Board Settings

### For AI-Thinker ESP32-CAM:
- **Board**: `AI Thinker ESP32-CAM`
- **CPU Frequency**: `240MHz (WiFi/BT)`
- **Flash Frequency**: `80MHz`
- **Flash Mode**: `QIO`
- **Partition Scheme**: `Huge APP (3MB No OTA/1MB SPIFFS)`
- **Core Debug Level**: `None` (or `Verbose` for diagnostics)
- **PSRAM**: `Enabled`

### For ESP32 DevKit V1 (Telemetry Hub):
- **Board**: `ESP32 Dev Module`
- **Upload Speed**: `921600` or `115200`
- **Flash Frequency**: `80MHz`
- **Partition Scheme**: `Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)`

---

## 3. Configuration & Wi-Fi Setup

Before flashing, update lines 29–30 in `esp32_navbot_firmware.ino` with your local 2.4 GHz network credentials:

```cpp
// WiFi Configuration (Connect to your phone's hotspot or home router)
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

> **Note**: The ESP32 hardware radio only supports **2.4 GHz** Wi-Fi networks (not 5 GHz).

---

## 4. Flashing Procedure (AI-Thinker ESP32-CAM)

Because the ESP32-CAM lacks an onboard USB-to-UART chip, connect it using an external FTDI / CH340 adapter:

```
FTDI Programmer           ESP32-CAM
----------------          ---------
VCC (5V)       ---------> 5V
GND            ---------> GND
TX             ---------> U0R (GPIO 3)
RX             ---------> U0T (GPIO 1)
                          IO0 tied to GND (Flashing Mode)
```

1. Bridge **GPIO 0 (IO0)** to **GND**.
2. Plug the FTDI programmer into your computer's USB port.
3. Press the onboard **RST** (Reset) button on the ESP32-CAM once.
4. In Arduino IDE, select the corresponding COM port and click **Upload**.
5. Once uploading completes (`Done uploading`), **disconnect IO0 from GND**.
6. Press the **RST** button again to boot into normal operating mode.
7. Open the Serial Monitor at `115200 baud` to view the assigned IP address.

---

## 5. Firmware Endpoints

When booted and connected to Wi-Fi, the firmware exposes:
- `http://<device_ip>/stream`: MJPEG live video stream.
- `http://<device_ip>/telemetry`: REST JSON payload with current sensor distances.

---

## 6. Troubleshooting Common Issues

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `Brownout detector was triggered` | Insufficient current during Wi-Fi / camera init. | Use a dedicated 5V 2A+ power supply. Add a 470 µF capacitor across 5V and GND. |
| `Camera probe failed with error 0x20001` | Camera ribbon cable unseated or damaged. | Re-seat the OV2640 FFC connector with pins facing away from the PCB. |
| `Failed to connect to ESP32: Timed out waiting for packet header` | GPIO 0 was not grounded before reset. | Bridge IO0 to GND, press Reset, and retry upload. |
| Wi-Fi connection loop / timeout | SSID or password typo, or attempting 5 GHz connection. | Verify router credentials and ensure the network broadcasts on 2.4 GHz. |
