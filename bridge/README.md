# Vision 23: ESP32-CAM USB Serial-to-MJPEG HTTP Bridge

This utility bridges raw serial video streams from an ESP32-CAM connected to your computer via USB (FTDI / CH340 / CP2102) into a standard HTTP MJPEG stream accessible by any web browser.

---

## 1. When to Use This Bridge

- **Wired Lab / Benchtop Testing**: When testing the computer vision pipeline without setting up a Wi-Fi router or hotspot.
- **Wi-Fi-Restricted Environments**: When campus or enterprise Wi-Fi networks block device-to-device communication (AP client isolation).
- **Zero Wi-Fi Latency**: Eliminates wireless packet drop and radio interference.

---

## 2. Installation & Prerequisites

1. Ensure Python 3.8+ is installed on your workstation.
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   *(Or directly: `pip install pyserial`)*

---

## 3. Usage Instructions

Run the script specifying your ESP32-CAM serial port:

### On Windows
```bash
python esp32_serial_stream.py --port COM22 --baud 115200 --http-port 8080
```

### On Linux / macOS
```bash
python esp32_serial_stream.py --port /dev/ttyUSB0 --baud 115200 --http-port 8080
```

---

## 4. Command-Line Arguments

| Argument | Default | Description |
| :--- | :---: | :--- |
| `--port` | `COM22` | Serial COM port identifier assigned to the ESP32. |
| `--baud` | `115200` | Baud rate for serial communication. |
| `--http-port` | `8080` | Local HTTP port to host the MJPEG stream. |

---

## 5. Connecting in the Vision 23 Web App

Once the bridge is running:
1. Open the Vision 23 dashboard in your browser (`http://localhost/robot-nav/`).
2. Click the **Settings** icon (top right).
3. Under **Stream Configuration**, enter:
   ```
   http://localhost:8080/stream
   ```
4. Click **Save Settings**. The live video feed will render in the HUD.
