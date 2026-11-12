# Hardware Setup & Pinout Reference Guide

This guide details the complete physical wiring, sensor integration, power considerations, and schematic pinouts for the **Vision 23 / Nav-Bot** hardware subsystem.

---

## 1. Bill of Materials (BOM)

| Item | Component | Specification | Quantity |
| :---: | :--- | :--- | :---: |
| 1 | **AI-Thinker ESP32-CAM** | Dual-core Tensilica LX6, OV2640 Camera, MicroSD slot, Onboard Flash LED | 1 |
| 2 | **ESP32 DevKit V1 (30 or 38 Pin)** | Dual-core MCU (Telemetry & Rangefinder Hub) | 1 |
| 3 | **TF-Luna LiDAR Sensor** | 850 nm ToF, 0.2 m – 8.0 m range, UART interface @ 115200 baud | 1 |
| 4 | **HC-SR04 Ultrasonic Sensor** | 40 kHz acoustic ranging, 2 cm – 400 cm range, 5V operating voltage | 1 |
| 5 | **Active Piezo Buzzer** | 3.3V – 5V active audible buzzer | 1 |
| 6 | **Resistors (Voltage Divider)** | 1 kΩ and 2 kΩ (or 10 kΩ and 20 kΩ) for HC-SR04 Echo 5V to 3.3V step-down | 1 set |
| 7 | **Electrolytic Capacitor** | 470 µF – 1000 µF (16V or 25V) for ESP32-CAM power rail decoupling | 1 |
| 8 | **USB-UART Programmer (FTDI / CH340)** | Required for flashing ESP32-CAM (set to 3.3V/5V) | 1 |
| 9 | **Power Supply Unit** | 5V DC / 2.5A+ regulated supply or 2S/3S LiPo with LM2596 buck converter | 1 |

---

## 2. ESP32 Sensor Hub Wiring & Pin Connections

The dedicated ESP32 microcontroller processes high-frequency sensor interrupts from the HC-SR04 ultrasonic sensor and the TF-Luna LiDAR.

### Pinout Mapping

```
+-------------------------------------------------------------------+
|                        ESP32 DevKit V1 Hub                        |
|                                                                   |
|   [GPIO 13] -------------> HC-SR04 Trig                           |
|   [GPIO 14] <------------- Voltage Divider (5V Echo -> 3.3V)     |
|   [GPIO 16] (RX2) <------- TF-Luna LiDAR TX                       |
|   [GPIO 17] (TX2) -------> TF-Luna LiDAR RX (Optional config)     |
|   [GPIO  4] -------------> Active Buzzer (+)                      |
|   [  GND  ] -------------> Common GND Rail                        |
|   [  VIN  ] <------------- Regulated 5V DC                        |
+-------------------------------------------------------------------+
```

### Detailed Sensor Connections

#### A. HC-SR04 Ultrasonic Sensor
> **CRITICAL VOLTAGE NOTICE**: The HC-SR04 operates at **5V VCC**. Its `Echo` output line generates a 5V digital logic pulse. Connecting this 5V line directly to an ESP32 GPIO pin may damage the 3.3V-tolerant ESP32. You **must** implement a voltage divider.

```
HC-SR04 ECHO (5V) 
      |
     [R1: 1kΩ]
      |
      +----------> Connect to ESP32 GPIO 14 (3.3V Logic Level)
      |
     [R2: 2kΩ]
      |
     GND
```
- **VCC** $\rightarrow$ `5V` (Common 5V power bus)
- **Trig** $\rightarrow$ `GPIO 13` (Direct 3.3V trigger output from ESP32)
- **Echo** $\rightarrow$ Stepped down through divider to `GPIO 14`
- **GND** $\rightarrow$ `GND`

#### B. Benewake TF-Luna LiDAR Sensor
- **Pin 1 (Red / VCC)** $\rightarrow$ `5V` (or `3.3V`, check module rating)
- **Pin 2 (White / RXD)** $\rightarrow$ `GPIO 17` (ESP32 `TX2` / Serial2 TX)
- **Pin 3 (Green / TXD)** $\rightarrow$ `GPIO 16` (ESP32 `RX2` / Serial2 RX)
- **Pin 4 (Black / GND)** $\rightarrow$ `GND`
- *Baud rate*: 115200 baud, 8 data bits, no parity, 1 stop bit.

#### C. Active Piezo Warning Buzzer
- **Positive (+)** $\rightarrow$ `GPIO 4`
- **Negative (-)** $\rightarrow$ `GND`
- *Tone behavior*: Emits pulsed beeps with interval proportional to detected distance; transitions to continuous solid alarm at $D \le 15\text{ cm}$.

---

## 3. AI-Thinker ESP32-CAM Setup

The ESP32-CAM is powered by a dedicated 5V line. It connects directly to the OV2640 camera module via its flexible flat cable (FFC).

### Pin Mapping Overview

```
+-------------------------------------------------------------------+
|                        AI-Thinker ESP32-CAM                       |
|                                                                   |
|   [ 5V  ] <--------------- Regulated 5V DC (min 2A)               |
|   [ GND ] <--------------- Common Ground                          |
|   [ U0T ] ---------------> FTDI RX (During Flashing)              |
|   [ U0R ] <--------------- FTDI TX (During Flashing)              |
|   [ IO0 ] ---[ Jumper ]--- GND (Bridge only while flashing)       |
+-------------------------------------------------------------------+
```

### Internal Pin Allocations (Reference)
- `PWDN_GPIO_NUM`: 32
- `RESET_GPIO_NUM`: -1 (Internal)
- `XCLK_GPIO_NUM`: 0
- `SIOD_GPIO_NUM`: 26
- `SIOC_GPIO_NUM`: 27
- `Y9..Y2`: Pins 35, 34, 39, 36, 21, 19, 18, 5
- `VSYNC`: 25, `HREF`: 23, `PCLK`: 22
- `FLASH LED`: GPIO 4

---

## 4. Power Architecture & Brownout Prevention

The ESP32-CAM and ESP32 DevKit draw significant current spikes during Wi-Fi transmission bursts (up to 310 mA) and camera JPEG encoding.

1. **Avoid USB Port Power Alone**:
   - Powering both the ESP32-CAM and ESP32 DevKit from a single laptop USB port frequently causes brownout reset loops (`Brownout detector was triggered`).
2. **Dedicated 5V / 2.5A Power Supply**:
   - Use a dedicated 5V regulated power brick or an external battery pack with an LM2596 DC-DC step-down buck converter.
3. **Decoupling Capacitors**:
   - Place a `470 µF` to `1000 µF` low-ESR electrolytic capacitor across the `5V` and `GND` terminals of the ESP32-CAM as close as possible to the module pins.
4. **Common Ground**:
   - Ensure all ground lines (`GND`) from the power supply, ESP32 Hub, ESP32-CAM, LiDAR, and Ultrasonic sensor are tied together into a single common ground bus.
