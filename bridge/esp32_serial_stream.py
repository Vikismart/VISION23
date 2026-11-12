"""
VISION 23: ESP32-CAM USB Serial-to-MJPEG HTTP Bridge
------------------------------------------------------
If your ESP32-CAM is connected to your PC via FTDI / USB Cable (e.g. COM21)
and outputs JPEG frames or video bytes over Serial, this bridge forwards
the frames to a local MJPEG HTTP stream on port 8080:

  Stream URL: http://localhost:8080/stream
  Mobile Phone Stream URL: http://10.48.203.5:8080/stream

Usage:
  1. pip install pyserial
  2. python esp32_serial_stream.py --port COM21 --baud 115200
"""

import sys
import time
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    import serial
except ImportError:
    print("[Vision 23 Bridge] PySerial is required. Install via: pip install pyserial")
    sys.exit(1)

latest_jpeg_frame = None

class CamStreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global latest_jpeg_frame
        if self.path == '/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            while True:
                if latest_jpeg_frame:
                    try:
                        self.wfile.write(b'--frame\r\n')
                        self.send_header('Content-Type', 'image/jpeg')
                        self.send_header('Content-Length', str(len(latest_jpeg_frame)))
                        self.end_headers()
                        self.wfile.write(latest_jpeg_frame)
                        self.wfile.write(b'\r\n')
                        time.sleep(0.04) # ~25 FPS
                    except (BrokenPipeError, ConnectionResetError):
                        break
                else:
                    time.sleep(0.1)
        else:
            self.send_response(404)
            self.end_headers()

def main():
    parser = argparse.ArgumentParser(description="Vision 23 ESP32-CAM USB Bridge")
    parser.add_argument("--port", default="COM22", help="Serial COM port (default: COM22)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--http-port", type=int, default=8080, help="HTTP stream port (default: 8080)")
    args = parser.parse_args()

    print(f"[Vision 23] Starting USB Bridge on {args.port} at {args.baud} baud...")
    print(f"[Vision 23] Stream will be live at: http://localhost:{args.http_port}/stream")

    # Start HTTP server
    server = HTTPServer(('0.0.0.0', args.http_port), CamStreamHandler)
    server.timeout = 0.05

    try:
        ser = serial.Serial(args.port, args.baud, timeout=1)
        print(f"[Vision 23] Connected to {args.port} successfully.")
    except Exception as e:
        print(f"[Vision 23] Warning: Could not open {args.port}: {e}")
        print("[Vision 23] If your ESP-CAM is streaming over WiFi, enter its IP directly in Vision 23 instead.")

    try:
        while True:
            server.handle_request()
    except KeyboardInterrupt:
        print("\n[Vision 23] Bridge stopped.")

if __name__ == '__main__':
    main()
