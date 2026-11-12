# Vision 23: Offline Vendor Libraries & AI Weights

This directory contains pre-packaged, offline-capable third-party client libraries and pre-trained neural network weights.

---

## 1. Bundled Assets

### `tf.min.js`
- **Library**: TensorFlow.js (Pre-compiled minified bundle)
- **Role**: Provides the client-side WebGL GPU execution engine for deep learning neural networks directly inside the web browser.

### `coco-ssd.min.js`
- **Library**: TensorFlow.js COCO-SSD Model Wrapper
- **Role**: Provides lightweight inference wrappers for object detection trained on the 80 common object classes in the COCO dataset.

### `models/ssdlite_mobilenet_v2/`
- **Topology**: `model.json` (TensorFlow.js GraphModel definition)
- **Weights**: `group1-shard1of5` through `group1-shard5of5` (~17.5 MB total binary weight tensors)
- **Model**: SSDLite MobileNetV2
- **Input Size**: $300 \times 300$ or $320 \times 320$ RGB tensor
- **Target Classes**: 80 object classes (people, vehicles, obstacles, chairs, bicycles, etc.)

---

## 2. Why Bundled Locally?

Robotics and assistive navigation systems must operate in remote areas, factory floors, or disaster sites where cellular reception and broadband internet are unavailable. Bundling all weights and runtime scripts locally guarantees:
1. **100% Offline Capability**: The system starts up and detects objects with zero WAN/Internet connectivity.
2. **Instant Warm-Up**: No network fetch delay or CDN latency on boot.
3. **Data Privacy**: All camera frames remain strictly on the local machine and never leave the browser.
