# Vision 23: API & Protocol Reference

This document provides complete technical specifications for all communication interfaces, REST endpoints, WebSocket protocols, and network discovery mechanisms used in Vision 23.

---

## 1. Network Auto-Discovery Service

### `GET /api/discover.php`
Inspects the host machine's ARP table (`arp -a`) and active network adapters to discover ESP32 modules dynamically on the local subnet.

#### Response Schema (`application/json`)
```json
{
  "success": true,
  "serverIp": "10.213.173.5",
  "subnet": "10.213.173",
  "camIp": "10.213.173.152",
  "telIp": "10.213.173.74",
  "camUrl": "http://10.213.173.152:81/stream",
  "telWsUrl": "ws://10.213.173.74:81",
  "discoveredDevices": [
    {
      "ip": "10.213.173.152",
      "mac": "24:0a:c4:xx:xx:xx"
    },
    {
      "ip": "10.213.173.74",
      "mac": "30:76:f5:xx:xx:xx"
    }
  ]
}
```

---

## 2. ESP32-CAM Video Stream

### `GET http://<cam_ip>:81/stream`
Continuously serves JPEG frames over an HTTP multipart stream.

- **Content-Type**: `multipart/x-mixed-replace; boundary=frame`
- **CORS Headers**: `Access-Control-Allow-Origin: *`
- **Frame Rate**: ~25 FPS
- **Resolution**: VGA (640x480) or QVGA (320x240)
- **Transport**: Standard HTTP/1.1 persistent connection.

#### Frame Envelope
```http
--frame
Content-Type: image/jpeg
Content-Length: 14280

<binary jpeg data>
\r\n
```

### `GET http://<cam_ip>:80/control?var=<variable>&val=<value>`
Allows real-time tuning of camera hardware parameters:
- `framesize`: Resolution index (`7` for SVGA, `6` for VGA, `5` for CIF, `4` for QVGA).
- `quality`: JPEG compression quality (`10` to `63`, lower means higher quality).
- `brightness`: `-2` to `2`.
- `contrast`: `-2` to `2`.
- `led_intensity`: `0` to `255` (PWM on Flash LED).

---

## 3. ESP32 Telemetry Hub

### WebSocket Stream: `ws://<tel_ip>:81`
Bidirectional WebSocket connection for ultra-low-latency real-time sensor telemetry.

#### Inbound Telemetry Packets (ESP32 $\rightarrow$ PWA Client)

##### LiDAR Measurement Frame
```json
{
  "sensor": "LiDAR",
  "distance": 206
}
```
*Note: `distance` is measured in centimeters.*

##### Ultrasonic Measurement Frame
```json
{
  "sensor": "Ultrasonic",
  "distance": 155
}
```
*Note: `distance` is measured in centimeters.*

##### Combined Telemetry Frame
```json
{
  "ultrasonic": 155.0,
  "lidar": 206.0,
  "signal": 94,
  "timestamp": 1730000000000
}
```

---

## 4. REST Polling Fallback

### `GET http://<tel_ip>/telemetry`
Polled automatically if WebSockets are unreachable or blocked by network firewall configurations.

#### Response Schema (`application/json`)
```json
{
  "ultrasonic": 155.0,
  "lidar": 206.0,
  "signal": 94
}
```

---

## 5. Python USB Serial Stream Bridge

### `GET http://localhost:8080/stream`
Served by `bridge/esp32_serial_stream.py` when running via USB FTDI cable.

- **Port**: `8080` (configurable via `--http-port`)
- **Default Baud**: `115200`
- **Stream Output**: `multipart/x-mixed-replace; boundary=frame`
