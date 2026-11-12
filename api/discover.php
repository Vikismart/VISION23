<?php
/**
 * VISION 23: Hardware & Network Auto-Discovery Endpoint
 * Fast ARP & interface inspection to detect ESP32-CAM and Telemetry ESP32 nodes
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

$response = [
    'success' => false,
    'serverIp' => '127.0.0.1',
    'subnet' => '10.112.87',
    'camIp' => '10.112.87.152',
    'telIp' => '10.112.87.74',
    'camUrl' => 'http://10.112.87.152:81/stream',
    'telWsUrl' => 'ws://10.112.87.74:81',
    'discoveredDevices' => []
];

try {
    $arpOutput = [];
    @exec('arp -a', $arpOutput);

    $interfaces = [];
    $currentIface = null;

    foreach ($arpOutput as $line) {
        $line = trim($line);
        if (preg_match('/Interface:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/i', $line, $m)) {
            $currentIface = $m[1];
            $interfaces[$currentIface] = [];
        } elseif ($currentIface && preg_match('/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+([0-9a-fA-F-]+)\s+dynamic/i', $line, $m)) {
            $ip = $m[1];
            $mac = strtolower(str_replace('-', ':', $m[2]));
            $interfaces[$currentIface][] = ['ip' => $ip, 'mac' => $mac];
        }
    }

    $activeIface = null;
    $foundCam = null;
    $foundTel = null;

    // Search for active Wi-Fi / LAN interface containing .152 or .74
    foreach ($interfaces as $iface => $devices) {
        if (str_starts_with($iface, '169.254.') || str_starts_with($iface, '127.')) {
            continue;
        }

        foreach ($devices as $dev) {
            $ip = $dev['ip'];
            $mac = $dev['mac'];

            // Match known ESP32 IPs (.152 for CAM, .74 for Telemetry) or Espressif MAC OUIs
            if (str_ends_with($ip, '.152')) {
                $foundCam = $ip;
                $activeIface = $iface;
            }
            if (str_ends_with($ip, '.74')) {
                $foundTel = $ip;
                $activeIface = $iface;
            }

            // Espressif MAC prefixes (30:76:f5, b4:bf:e9, 24:0a:c4, 48:e7:29, dc:54:75)
            if (preg_match('/^(30:76:f5|b4:bf:e9|24:0a:c4|48:e7:29|dc:54:75|ac:67:b2|a4:cf:12)/i', $mac)) {
                $response['discoveredDevices'][] = ['ip' => $ip, 'mac' => $mac];
                if (!$activeIface) $activeIface = $iface;
            }
        }
    }

    // Determine primary subnet
    if ($activeIface) {
        $parts = explode('.', $activeIface);
        $subnet = "{$parts[0]}.{$parts[1]}.{$parts[2]}";
        $response['serverIp'] = $activeIface;
        $response['subnet'] = $subnet;
        $response['camIp'] = $foundCam ?: "{$subnet}.152";
        $response['telIp'] = $foundTel ?: "{$subnet}.74";
        $response['camUrl'] = "http://{$response['camIp']}:81/stream";
        $response['telWsUrl'] = "ws://{$response['telIp']}:81";
        $response['success'] = true;
    } else {
        // Fallback to client IP if available
        $remote = $_SERVER['REMOTE_ADDR'] ?? '';
        if ($remote && !str_starts_with($remote, '127.') && !str_starts_with($remote, '::')) {
            $parts = explode('.', $remote);
            if (count($parts) === 4) {
                $subnet = "{$parts[0]}.{$parts[1]}.{$parts[2]}";
                $response['subnet'] = $subnet;
                $response['camIp'] = "{$subnet}.152";
                $response['telIp'] = "{$subnet}.74";
                $response['camUrl'] = "http://{$response['camIp']}:81/stream";
                $response['telWsUrl'] = "ws://{$response['telIp']}:81";
                $response['success'] = true;
            }
        }
    }
} catch (Exception $e) {
    $response['error'] = $e->getMessage();
}

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
