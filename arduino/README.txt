# EPA-Dunk Arduino Controller

Arduino MKR Zero sketch för att styra EPA-dunk stationen med fysiska encoders och knappar.

## Hardware-anslutningar

### Encoders (4 st)
Varje encoder har 2 pins: CLK och DT

- **Tempo encoder:**
  - CLK → Pin 2
  - DT → Pin 3

- **Typ encoder:**
  - CLK → Pin 4
  - DT → Pin 5

- **Energi encoder:**
  - CLK → Pin 6
  - DT → Pin 7

- **Trummor encoder:**
  - CLK → Pin 8
  - DT → Pin 9

### Knappar (3 st)
Alla knappar använder interna pull-up resistors

- **Bass Plus knapp:** Pin 10
- **Dist knapp:** Pin 11
- **Ignition (tändningsnyckel):** Pin 12

**Notera:** Knapparna ska vara anslutna mellan pin och GND (active LOW).

## Installation

1. Öppna `epa_dunk_controller.ino` i Arduino IDE
2. Välj **Tools → Board → Arduino MKR Zero**
3. Välj rätt Serial Port under **Tools → Port**
4. Ladda upp sketch till Arduino

## Användning

1. Starta serial bridge:
   ```bash
   npm run bridge
   ```

2. Starta webbservern (i ett annat terminalfönster):
   ```bash
   npm start
   ```

3. Öppna webbsidan i webbläsaren

Arduino kommer automatiskt att skicka uppdateringar när du:
- Vrider encoders (uppdaterar visarna)
- Trycker på knappar (toggla bass/dist eller starta/stoppa med ignition)

## Felsökning

### Arduino hittas inte
- Kontrollera att Arduino är ansluten via USB
- Kontrollera att rätt port är vald i Arduino IDE
- I `serial-bridge.js` kan du ändra `SERIAL_PORT` om porten inte hittas automatiskt

### WebSocket-anslutning misslyckas
- Kontrollera att `serial-bridge.js` körs (port 3001)
- Kontrollera brandvägg-inställningar
- För HTTPS, ändra WebSocket-protokollet i `script.js` till `wss:`

### Encoders fungerar inte
- Kontrollera att CLK och DT är korrekt anslutna
- Testa att encoders ger signaler med Serial Monitor i Arduino IDE
- Kontrollera att encoders har ström (VCC och GND)

### Knappar fungerar inte
- Kontrollera att knapparna är anslutna mellan pin och GND
- Testa med Serial Monitor att knapptryckningar registreras
- Kontrollera debounce-tiden i koden (50ms)
