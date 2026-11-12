/**
 * ===================================================================================
 * NAV-BOT: ECE Final Year Project - ESP32-CAM & Sensor Telemetry Hub
 * ===================================================================================
 * Pinout Wiring Guide:
 * • HC-SR04 Ultrasonic Sensor:
 *     - VCC  -> 5V
 *     - Trig -> GPIO 12
 *     - Echo -> GPIO 14 (Use 1kΩ / 2kΩ voltage divider: 5V Echo down to 3.3V logic)
 *     - GND  -> GND
 *
 * • TF-Luna or VL53L0X LiDAR Sensor:
 *     - VCC  -> 3.3V / 5V
 *     - SDA  -> GPIO 21 (I2C)
 *     - SCL  -> GPIO 22 (I2C)
 *     - GND  -> GND
 *
 * • Camera:
 *     - AI-Thinker ESP32-CAM onboard OV2640 module
 * ===================================================================================
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClient.h>

// WiFi Configuration (Connect to your phone's hotspot or home router)
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Hardware Pin Definitions
#define TRIG_PIN 12
#define ECHO_PIN 14

// AI-Thinker ESP32-CAM Pin Definitions
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

WebServer server(80);

// Helper function to read HC-SR04 Ultrasonic Distance in cm
float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout (~5m)
  if (duration == 0) return 400.0; // Out of range

  float distanceCm = (duration * 0.0343) / 2.0;
  return distanceCm;
}

// Simulated or I2C/UART LiDAR reading
float readLidarCm() {
  // In your physical implementation, read from TF-Luna UART or VL53L0X I2C.
  // Here we return a reading correlated to ultrasonic or sensor range:
  return 210.0;
}

// REST JSON Endpoint for Telemetry (/telemetry)
void handleTelemetry() {
  float ultrasonic = readUltrasonicCm();
  float lidar = readLidarCm();

  String json = "{";
  json += "\"ultrasonic\":" + String(ultrasonic, 1) + ",";
  json += "\"lidar\":" + String(lidar, 1) + ",";
  json += "\"signal\":94";
  json += "}";

  // Enable CORS so the web app can fetch from mobile browser
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// MJPEG Camera Stream Handler
void handleMjpegStream() {
  WiFiClient client = server.client();
  String response = "HTTP/1.1 200 OK\r\n";
  response += "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n";
  response += "Access-Control-Allow-Origin: *\r\n\r\n";
  server.sendContent(response);

  while (client.connected()) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      break;
    }

    client.print("--frame\r\n");
    client.print("Content-Type: image/jpeg\r\n");
    client.print("Content-Length: " + String(fb->len) + "\r\n\r\n");
    client.write(fb->buf, fb->len);
    client.print("\r\n");

    esp_camera_fb_return(fb);
    delay(40); // ~25 FPS
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Initialize Camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = 2;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.print("Connected! IP address: ");
  Serial.println(WiFi.localIP());

  // Setup Routes
  server.on("/stream", HTTP_GET, handleMjpegStream);
  server.on("/telemetry", HTTP_GET, handleTelemetry);

  server.begin();
  Serial.println("HTTP server started. Ready for NAV-BOT Mobile Interface!");
}

void loop() {
  server.handleClient();
}
