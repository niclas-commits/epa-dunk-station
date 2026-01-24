/************************************************************
 *  SERIAL-TO-WEBSOCKET BRIDGE
 *  Läser från Arduino Serial och skickar till webbsidan via WebSocket
 ************************************************************/

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');
const http = require('http');

const SERIAL_BAUD = 115200;
const WS_PORT = 3001;

// ==========================================================
//  WEBSOCKET SERVER
// ==========================================================
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const clients = new Set();

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
  console.log('🔍 Looking for Arduino...');
  connectSerial();
});
