/************************************************************
 *  SERIAL-TO-WEBSOCKET BRIDGE
 *  Läser från Arduino Serial och skickar till webbsidan via WebSocket
 ************************************************************/

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

const SERIAL_BAUD = 115200;
const WS_PORT = 3001;
const RELAY_URL = process.env.ARDUINO_RELAY_URL || "";
const RELAY_TOKEN = process.env.ARDUINO_RELAY_TOKEN || "";
const RELAY_INTERVAL_MS = Math.max(100, Number(process.env.ARDUINO_RELAY_INTERVAL_MS || 200));

// ==========================================================
//  WEBSOCKET SERVER
// ==========================================================
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const clients = new Set();

// ==========================================================
//  RELAY STATE (POST to Railway)
// ==========================================================
const relayState = {
  gauges: { tempo: 50, typ: 50, energi: 50, trummor: 50 },
  buttons: { bassPlus: false, dist: false, ignition: false },
  lastEventAt: null
};
let relayDirty = false;

function markRelayDirty() {
  relayState.lastEventAt = new Date().toISOString();
  relayDirty = true;
}

function handleRelayEvent(evt) {
  if (!evt || typeof evt !== "object") return;

  if (evt.type === "encoder" && typeof evt.name === "string") {
    if (Object.prototype.hasOwnProperty.call(relayState.gauges, evt.name)) {
      const v = Number(evt.value);
      if (Number.isFinite(v)) {
        relayState.gauges[evt.name] = Math.max(0, Math.min(100, Math.round(v)));
        markRelayDirty();
      }
    }
    return;
  }

  if (evt.type === "button" && typeof evt.name === "string") {
    const pressed = evt.pressed === true || evt.pressed === "true";
    if (evt.name === "bassPlus") {
      relayState.buttons.bassPlus = pressed;
      markRelayDirty();
    } else if (evt.name === "dist") {
      relayState.buttons.dist = pressed;
      markRelayDirty();
    } else if (evt.name === "ignition") {
      relayState.buttons.ignition = pressed;
      markRelayDirty();
    }
  }
}

async function flushRelayState() {
  if (!RELAY_URL || !RELAY_TOKEN || !relayDirty) return;
  relayDirty = false;

  try {
    await axios.post(
      `${RELAY_URL.replace(/\/+$/, "")}/api/arduino-relay`,
      { state: relayState },
      {
        headers: { "x-arduino-relay-token": RELAY_TOKEN },
        timeout: 5000
      }
    );
  } catch (err) {
    relayDirty = true;
    const msg = err.response?.status ? `${err.response.status} ${err.response.statusText}` : err.message;
    console.warn(`⚠️ Relay push failed: ${msg}`);
  }
}

wss.on('connection', (ws) => {
  console.log('📱 WebSocket client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    console.log('📱 WebSocket client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// Broadcast to all clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

setInterval(flushRelayState, RELAY_INTERVAL_MS);

// ==========================================================
//  SERIAL PORT
// ==========================================================
let port = null;
let parser = null;

function connectSerial() {
  // Try to find Arduino port
  SerialPort.list().then(ports => {
    // Try to find Arduino MKR Zero or any USB serial port
    let arduinoPort = ports.find(p => 
      p.path.includes('usbmodem') || 
      p.path.includes('USB') ||
      p.manufacturer?.toLowerCase().includes('arduino') ||
      p.vendorId === '2341' // Arduino vendor ID
    );
    
    // If not found, try to use environment variable or first available port
    if (!arduinoPort && process.env.ARDUINO_PORT) {
      arduinoPort = ports.find(p => p.path === process.env.ARDUINO_PORT);
    }
    
    if (!arduinoPort) {
      console.log('⚠️  Arduino not found. Available ports:');
      ports.forEach(p => {
        console.log(`   - ${p.path} (${p.manufacturer || 'unknown'})`);
      });
      console.log('💡 Tip: Set ARDUINO_PORT environment variable to specify port manually');
      console.log('🔄 Retrying in 5 seconds...');
      setTimeout(connectSerial, 5000);
      return;
    }
    
    console.log(`🔌 Connecting to Arduino at ${arduinoPort.path}`);
    
    port = new SerialPort({
      path: arduinoPort.path,
      baudRate: SERIAL_BAUD,
      autoOpen: false
    });
    
    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    
    port.open((err) => {
      if (err) {
        console.error('❌ Serial port error:', err.message);
        setTimeout(connectSerial, 5000);
        return;
      }
      
      console.log('✅ Serial port opened');
    });
    
    parser.on('data', (data) => {
      try {
        const json = JSON.parse(data.toString().trim());
        console.log('📥 From Arduino:', json);
        broadcast(json);
        handleRelayEvent(json);
      } catch (e) {
        // Not JSON, ignore
      }
    });
    
    port.on('error', (err) => {
      console.error('❌ Serial error:', err.message);
      port = null;
      parser = null;
      setTimeout(connectSerial, 5000);
    });
    
    port.on('close', () => {
      console.log('🔌 Serial port closed');
      port = null;
      parser = null;
      setTimeout(connectSerial, 5000);
    });
  }).catch(err => {
    console.error('❌ Error listing ports:', err);
    setTimeout(connectSerial, 5000);
  });
}

// ==========================================================
//  START
// ==========================================================
server.listen(WS_PORT, () => {
  console.log(`🚀 WebSocket server running on port ${WS_PORT}`);
  if (RELAY_URL && RELAY_TOKEN) {
    console.log(`🌐 Arduino relay enabled -> ${RELAY_URL}/api/arduino-relay`);
  } else {
    console.log("ℹ️ Arduino relay disabled (set ARDUINO_RELAY_URL + ARDUINO_RELAY_TOKEN to enable)");
  }
  console.log('🔍 Looking for Arduino...');
  connectSerial();
});
