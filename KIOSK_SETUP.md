# Kiosk Setup Guide - Ubuntu NUC

Komplett guide för att köra EPA-Dunk Station i kioskmiljö på Ubuntu NUC med automatisk start och fullscreen webbläsare.

## Förutsättningar

- Ubuntu 20.04 eller senare
- NUC med i5 processor
- Arduino MKR Zero ansluten via USB
- Internetanslutning (för Railway deployment eller lokalt)

---

## Steg 1: Grundläggande Ubuntu Setup

### 1.1. Uppdatera systemet

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2. Installera nödvändiga verktyg

```bash
sudo apt install -y curl git build-essential
```

---

## Steg 2: Installera Node.js

### 2.1. Installera Node.js 20.x (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2.2. Verifiera installation

```bash
node --version
npm --version
```

Du bör se Node.js version 20.x eller senare.

---

## Steg 3: Installera Projektet

### 3.1. Klona repository

```bash
cd /home
sudo mkdir -p /opt/epa-dunk-station
sudo chown $USER:$USER /opt/epa-dunk-station
cd /opt/epa-dunk-station
git clone https://github.com/niclas-commits/epa-dunk-station.git .
```

### 3.2. Installera dependencies

```bash
npm install
```

### 3.3. Skapa miljövariabler

```bash
nano .env
```

Lägg till (anpassa efter ditt setup):

```env
# Om du kör servern lokalt
PORT=3000
DATABASE_URL=postgresql://user:password@host:port/database

# AWS S3
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=din_access_key
AWS_SECRET_ACCESS_KEY=din_secret_key
AWS_S3_BUCKET=ditt_bucket_namn

# Stable Audio API
STABILITY_API_KEY=din_stability_api_key

# Arduino (om du kör lokalt)
ARDUINO_PORT=/dev/ttyACM0  # eller /dev/ttyUSB0, kolla med: ls /dev/tty*
```

**OBS:** Om du använder Railway för servern, behöver du bara Arduino-relaterade variabler här.

---

## Steg 4: Konfigurera Serial Bridge (för lokalt)

### 4.1. Lägg till användare i dialout-gruppen (för USB-serial access)

```bash
sudo usermod -a -G dialout $USER
```

Logga ut och in igen för att ändringarna ska gälla.

### 4.2. Testa Arduino-anslutning

```bash
ls /dev/tty* | grep -E "(ACM|USB)"
```

Du bör se något som `/dev/ttyACM0` eller `/dev/ttyUSB0` när Arduino är ansluten.

### 4.3. Testa serial bridge

```bash
npm run bridge
```

Du bör se: `✅ Serial port opened` och `🔌 Connecting to Arduino at /dev/ttyACM0`

---

## Steg 5: Installera och Konfigurera Webbläsare (Kiosk Mode)

### 5.1. Installera Chromium

```bash
sudo apt install -y chromium-browser
```

### 5.2. Skapa kiosk startup script

```bash
sudo nano /opt/epa-dunk-station/start-kiosk.sh
```

Lägg till:

```bash
#!/bin/bash

# Vänta på att systemet är klart
sleep 5

# Starta serial bridge i bakgrunden (om lokalt)
cd /opt/epa-dunk-station
npm run bridge > /var/log/epa-bridge.log 2>&1 &

# Vänta lite för att bridge ska starta
sleep 3

# Starta Chromium i kiosk-läge
# Använd Railway URL eller localhost om du kör lokalt
CHROMIUM_FLAGS="--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-features=TranslateUI --autoplay-policy=no-user-gesture-required"

# Välj URL (ändra till din Railway URL eller localhost:3000)
KIOSK_URL="https://din-app.up.railway.app"
# ELLER för lokalt: KIOSK_URL="http://localhost:3000"

chromium-browser $CHROMIUM_FLAGS "$KIOSK_URL" &
```

Gör scriptet körbart:

```bash
sudo chmod +x /opt/epa-dunk-station/start-kiosk.sh
```

---

## Steg 6: Auto-start Konfiguration

### 6.1. Skapa systemd service för serial bridge

```bash
sudo nano /etc/systemd/system/epa-bridge.service
```

Lägg till:

```ini
[Unit]
Description=EPA Dunk Station Serial Bridge
After=network.target

[Service]
Type=simple
User=epa
WorkingDirectory=/opt/epa-dunk-station
Environment="NODE_ENV=production"
EnvironmentFile=/opt/epa-dunk-station/.env
ExecStart=/usr/bin/npm run bridge
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**OBS:** Ändra `User=epa` till ditt användarnamn, eller skapa en dedikerad användare:

```bash
sudo useradd -m -s /bin/bash epa
sudo chown -R epa:epa /opt/epa-dunk-station
```

### 6.2. Skapa systemd service för kiosk webbläsare

```bash
sudo nano /etc/systemd/system/epa-kiosk.service
```

Lägg till:

```ini
[Unit]
Description=EPA Dunk Station Kiosk Browser
After=graphical.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=epa
Environment="DISPLAY=:0"
ExecStart=/opt/epa-dunk-station/start-kiosk.sh
Restart=always
RestartSec=10

[Install]
WantedBy=graphical.target
```

### 6.3. Aktivera services

```bash
sudo systemctl daemon-reload
sudo systemctl enable epa-bridge.service
sudo systemctl enable epa-kiosk.service
```

---

## Steg 7: Konfigurera Auto-login (valfritt)

Om du vill att systemet ska logga in automatiskt:

### 7.1. För Ubuntu Desktop

```bash
sudo nano /etc/gdm3/custom.conf
```

Avkommentera (ta bort `#`):

```ini
[daemon]
AutomaticLogin=epa
AutomaticLoginEnable=true
```

### 7.2. För Ubuntu Server med X11

Om du använder lightdm:

```bash
sudo nano /etc/lightdm/lightdm.conf
```

Lägg till:

```ini
[Seat:*]
autologin-user=epa
autologin-user-timeout=0
```

---

## Steg 8: Disable Screen Saver och Power Management

### 8.1. Disable screen saver

```bash
sudo apt install -y x11-xserver-utils
```

Lägg till i `start-kiosk.sh` (före chromium-start):

```bash
# Disable screen saver
xset s off
xset -dpms
xset s noblank
```

### 8.2. Disable sleep/hibernate

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

---

## Steg 9: Konfigurera Firewall (om lokalt)

Om du kör servern lokalt och vill exponera den:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw enable
```

---

## Steg 10: Testa Installationen

### 10.1. Testa services manuellt

```bash
# Testa serial bridge
sudo systemctl start epa-bridge.service
sudo systemctl status epa-bridge.service

# Testa kiosk
sudo systemctl start epa-kiosk.service
sudo systemctl status epa-kiosk.service
```

### 10.2. Kolla logs

```bash
# Serial bridge logs
journalctl -u epa-bridge.service -f

# Kiosk logs
journalctl -u epa-kiosk.service -f
```

### 10.3. Reboot och testa

```bash
sudo reboot
```

Efter reboot bör:
- Systemet logga in automatiskt
- Serial bridge starta
- Chromium öppna i fullscreen kiosk-läge
- Webbsidan laddas automatiskt

---

## Felsökning

### Serial bridge startar inte

```bash
# Kolla att Arduino är ansluten
ls /dev/tty* | grep -E "(ACM|USB)"

# Kolla att användaren är i dialout-gruppen
groups

# Testa manuellt
cd /opt/epa-dunk-station
npm run bridge
```

### Webbläsare öppnas inte

```bash
# Kolla att X11/display fungerar
echo $DISPLAY

# Testa att starta Chromium manuellt
chromium-browser --kiosk http://localhost:3000
```

### WebSocket-anslutning misslyckas

- Kontrollera att serial bridge körs: `systemctl status epa-bridge.service`
- Kontrollera port 3001: `netstat -tuln | grep 3001`
- Kolla logs: `journalctl -u epa-bridge.service -n 50`

### Arduino hittas inte

```bash
# Lista alla serial ports
ls -la /dev/tty*

# Kolla Arduino port
dmesg | grep -i tty

# Sätt ARDUINO_PORT i .env om porten inte hittas automatiskt
```

---

## Ytterligare Optimeringar

### Disable Ubuntu Updates (för stabil kiosk)

```bash
sudo systemctl disable apt-daily.service
sudo systemctl disable apt-daily-upgrade.service
```

### Auto-restart vid krasch

Services är redan konfigurerade med `Restart=always`, men du kan också lägga till i `start-kiosk.sh`:

```bash
# Watchdog - restart om webbläsaren stängs
while true; do
  if ! pgrep -x chromium-browser > /dev/null; then
    chromium-browser $CHROMIUM_FLAGS "$KIOSK_URL" &
  fi
  sleep 5
done
```

### Remote Access (SSH)

För att kunna underhålla systemet:

```bash
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh
```

---

## Backup och Restore

### Skapa backup av konfiguration

```bash
sudo tar -czf epa-dunk-backup-$(date +%Y%m%d).tar.gz \
  /opt/epa-dunk-station \
  /etc/systemd/system/epa-*.service \
  /opt/epa-dunk-station/start-kiosk.sh
```

### Restore

```bash
sudo tar -xzf epa-dunk-backup-YYYYMMDD.tar.gz -C /
sudo systemctl daemon-reload
sudo systemctl restart epa-bridge.service epa-kiosk.service
```

---

## Uppdateringar

### Uppdatera projektet

```bash
cd /opt/epa-dunk-station
git pull origin main
npm install
sudo systemctl restart epa-bridge.service
```

---

## Support

För problem, kolla:
- Serial bridge logs: `journalctl -u epa-bridge.service -f`
- Kiosk logs: `journalctl -u epa-kiosk.service -f`
- System logs: `journalctl -xe`
