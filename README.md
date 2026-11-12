# VISION 23

> **Real-Time Embedded Robotics Perception, Computer Vision & Sensory Telemetry Web HUD**  
> *Progressive Web App (PWA) ready for GitHub Pages hosting.*

---

## Overview

**Vision 23** is a high-performance web-based robotics perception and assistive navigation interface designed to run directly in any modern browser. It delivers real-time spatial awareness, object detection, telemetry visualization, and hands-free voice assistance without requiring server-side processing.

### Key Capabilities

- **Client-Side AI Object Detection**: In-browser machine learning inference running via **TensorFlow.js (WebGL backend)** with offline-bundled SSDLite MobileNetV2 weights.
- **Multiple Video Stream Sources**:
  - **ESP32-CAM Wi-Fi Stream**: Real-time MJPEG network video feed.
  - **USB / Integrated Camera**: Direct local webcam capture with hardware selector.
  - **Simulation Mode**: Built-in procedural sensor telemetry and canvas animation for offline demonstration and testing.
- **Sensor Telemetry & Fusion HUD**: Visualizes distance vectors from ultrasonic and Time-of-Flight (ToF) LiDAR sensors with real-time danger/caution threat scoring.
- **Hands-Free Voice Interface**: Two-way voice command recognition (Web Speech API) and audio status readouts.
- **100% Client-Side & Static**: Fully compatible with static hosting platforms such as **GitHub Pages**.
- **Progressive Web App (PWA)**: Installable on Android, iOS, and desktop with offline asset caching via Service Worker.

---

## Project Structure

```
robot-nav/
├── .gitattributes            # Line ending normalization & binary rules
├── .gitignore                # Excludes operating system & editor files
├── .nojekyll                 # Bypasses Jekyll on GitHub Pages
├── index.html                # Main HUD interface
├── manifest.json             # Progressive Web App manifest
├── sw.js                     # Offline caching Service Worker
├── README.md                 # Deployment & user guide
├── assets/                   # App icons, favicon, and brand logo
│   ├── favicon.ico
│   ├── icon-192.png
│   ├── icon-512.png
│   └── logo.svg
├── css/                      # Responsive cyber HUD styling
│   └── style.css
├── js/                       # Modular frontend architecture
│   ├── app.js                # Lifecycle, event routing & simulation loop
│   ├── path_history.js       # Navigation trail & obstacle logging
│   ├── state.js              # Central reactive event-emitter state
│   ├── telemetry.js          # Telemetry parser, radar gauge & charts
│   ├── vision.js             # TensorFlow.js detector & bounding box HUD
│   └── voice.js              # Web Speech recognition & speech synthesis
└── vendor/                   # Self-contained offline AI dependencies
    ├── coco-ssd.min.js       # COCO-SSD detection wrapper
    ├── tf.min.js             # TensorFlow.js v4 runtime
    └── models/
        └── ssdlite_mobilenet_v2/
            ├── model.json    # Model graph topology
            └── group1-shard* # Pre-trained neural network binary weights
```

---

## Hosting on GitHub Pages

Because Vision 23 is built purely with client-side standards (HTML5, Vanilla ES6 JavaScript, WebGL, Web Audio, and Service Workers), it can be deployed to **GitHub Pages** in under two minutes.

### Step 1: Initialize Git and Commit
From this folder, run:
```bash
git add .
git commit -m "Prepare Vision 23 for GitHub Pages deployment"
```

### Step 2: Push to GitHub
Create a new repository on [GitHub](https://github.com/new) (e.g. `vision-23`), then link your remote and push:
```bash
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
git branch -M main
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. On GitHub, navigate to your repository's **Settings** tab.
2. In the left navigation menu, click **Pages** (under *Code and automation*).
3. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`.
   - **Branch**: Select `main` (or your default branch) and folder `/ (root)`.
4. Click **Save**.
5. Wait 1–2 minutes for the GitHub Actions deployment workflow to finish.
6. Your live site URL will be displayed at the top:
   ```
   https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/
   ```

---

## Browser Permissions & Connectivity on HTTPS

When hosted on GitHub Pages (`https://`):

1. **Webcam & Microphone (Enabled by Default)**: Modern browsers require HTTPS to grant camera and microphone access. GitHub Pages automatically satisfies this requirement, enabling the **USB / PC Cam** and **Voice UI** features out of the box.
2. **Local ESP32 Camera Feed (Mixed Content Note)**:
   - If your ESP32-CAM streams over plain HTTP (e.g. `http://192.168.x.x:81/stream`), browsers may block mixed content on an HTTPS page.
   - **Solutions**:
     - Use **USB / PC Cam** or **Simulation Mode** (100% works anywhere without configuration).
     - Or in Chrome/Edge, click the tune/lock icon next to the address bar $\rightarrow$ **Site settings** $\rightarrow$ set **Insecure content** to **Allow**.
