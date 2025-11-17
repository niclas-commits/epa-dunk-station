/************************************************************
 *  EPA-DUNK STATION — FRONTEND
 *  4 nålar + 2 knappar + promptmotor + VU-meter + lampor
 ************************************************************/

// ==========================================================
//  G A U G E S  (4 nålar, alla 0–100)
// ==========================================================
const gaugeConfig = {
  tempo:   { min: -140, max: 140, needleId: "needle-tempo"   },
  typ:     { min: -120, max: 120, needleId: "needle-typ"     },
  energi:  { min: -120, max: 120, needleId: "needle-energi"  },
  trummor: { min: -120, max: 120, needleId: "needle-trummor" }
};

const gaugeValues = {
  tempo: 50,
  typ: 50,
  energi: 50,
  trummor: 50
};

function valueToAngle(group, value) {
  const g = gaugeConfig[group];
  return g.min + (g.max - g.min) * (value / 100);
}

function setNeedle(group) {
  const g = gaugeConfig[group];
  const needle = document.getElementById(g.needleId);
  if (!needle) return;
  const angle = valueToAngle(group, gaugeValues[group]);
  needle.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
}

// klicka mätare (radial)
function handleGaugeClick(e) {
  const group = e.currentTarget.dataset.group;
  const cfg = gaugeConfig[group];
  if (!cfg) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = e.clientX - cx;
  const dy = e.clientY - cy;

  let raw = Math.atan2(dy, dx) * 180 / Math.PI;
  let angle = raw + 90;

  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;

  if (angle < cfg.min || angle > cfg.max) return;

  const t = (angle - cfg.min) / (cfg.max - cfg.min);
  gaugeValues[group] = Math.round(t * 100);

  setNeedle(group);
}

// ==========================================================
//  D A S H B O A R D  S C A L I N G
// ==========================================================
function resizeDashboard() {
  const dash = document.getElementById("dashboard");
  if (!dash) return;

  const scaleX = window.innerWidth / 1920;
  const scaleY = window.innerHeight / 1080;
  dash.style.setProperty("--scale", Math.min(scaleX, scaleY));
}
window.addEventListener("resize", resizeDashboard);
document.addEventListener("DOMContentLoaded", resizeDashboard);

// ==========================================================
//  2 K N A P P A R  (Bass+ och Dist)
// ==========================================================
let bassPlusOn = false;
let distOn = false;

// central state object (ensures toggleButton and buildPayload use same values)
let state = {
  bassPlusOn: false,
  distOn: false
};

function toggleButton(id, stateVar) {
  const el = document.getElementById(id);
  const newState = !state[stateVar];
  state[stateVar] = newState;

  const base = (id === "btn_bassplus") ? "button1" : "button2";
  el.src = `/images/${base}_${newState ? "on" : "off"}.jpg`;
}

// ==========================================================
//  L A M P O R   (9 st) + BLINK
// ==========================================================
let blinkTimer = null;
let lampCursor = 0; // position of the left-to-right wave (0..8)

function lampSrc(n, on) {
  return `/images/lamp${n}_${on ? "on" : "off"}.jpg`;
}

function setLamp(n, on) {
  const el = document.getElementById("lamp" + n);
  if (el) el.src = lampSrc(n, on);
}

function allLampsOff() {
  for (let i = 1; i <= 9; i++) setLamp(i, false);
}

// Inspiring left-to-right VU lamp wave.
// - number of lit lamps (1..9) = mapped from average VU (0–100)
// - wave cursor moves left→right; speed is influenced by tempo
function startBlink() {
  if (blinkTimer) return;
  lampCursor = 0;

  blinkTimer = setInterval(() => {
    // If there's no playing audio, keep lamps off
    if (!currentAudio || currentAudio.paused) {
      allLampsOff();
      return;
    }

    // average VU value (0..100)
    const avgVU = (
      gaugeValues.tempo +
      gaugeValues.typ +
      gaugeValues.energi +
      gaugeValues.trummor
    ) / 4;

    // map avgVU to how many lamps should be lit (1..9)
    const activeCount = Math.max(1, Math.round((avgVU / 100) * 9));

    // tempo influences how fast the cursor moves (higher tempo -> faster)
    // tempo is 0..100, map to step interval multiplier (0.5..1.8)
    const tempoFactor = Math.max(0.5, Math.min(1.8, 0.5 + (gaugeValues.tempo / 100) * 1.3));

    // advance cursor (use tempoFactor to occasionally advance faster)
    lampCursor = (lampCursor + 1) % 9;

    // Light a block of activeCount lamps starting from lampCursor, wrapping rightwards
    for (let i = 1; i <= 9; i++) {
      const el = document.getElementById("lamp" + i);
      if (!el) continue;
      // distance from cursor (0..8)
      const dist = (i - 1 - lampCursor + 9) % 9;
      const on = dist < activeCount;
      el.src = lampSrc(i, on);
    }

    // Adjust interval rhythm slightly by occasionally skipping a tick based on tempoFactor
    // (keeps movement lively without additional timers)
    if (Math.random() < (tempoFactor - 0.5) / 1.3) {
      // extra immediate advance for a snappier feel at higher tempo
      lampCursor = (lampCursor + 1) % 9;
    }
  }, 100);
}

function stopBlink() {
  clearInterval(blinkTimer);
  blinkTimer = null;
  allLampsOff();
}

// ==========================================================
//  P A Y L O A D  (vad vi skickar till servern)
// ==========================================================
function buildPayload() {
  return {
    tempo: gaugeValues.tempo,
    typ_value: gaugeValues.typ,
    energi_value: gaugeValues.energi,
    trummor_value: gaugeValues.trummor,
    bassPlus: state.bassPlusOn,
    dist: state.distOn
  };
}


// ==========================================================
//  V U - M E T E R (nålar rör sig till musiken)
// ==========================================================
let vuTimer = null;
let currentAudio = null;

function startVU() {
  if (vuTimer) return;

  vuTimer = setInterval(() => {
      if (!currentAudio || currentAudio.paused) return;

      // större utslag
      const boost = 25;

      const rnd = () => (Math.random() * boost - boost/2);

      gaugeValues.tempo   = Math.max(0, Math.min(100, gaugeValues.tempo   + rnd()));
      gaugeValues.typ     = Math.max(0, Math.min(100, gaugeValues.typ     + rnd()));
      gaugeValues.energi  = Math.max(0, Math.min(100, gaugeValues.energi  + rnd()));
      gaugeValues.trummor = Math.max(0, Math.min(100, gaugeValues.trummor + rnd()));

      ["tempo", "typ", "energi", "trummor"].forEach(setNeedle);
  }, 120);
}

function stopVU() {
  clearInterval(vuTimer);
  vuTimer = null;

  // reset needles to center (50) when VU stops
  ["tempo", "typ", "energi", "trummor"].forEach(group => {
    gaugeValues[group] = 50;
    setNeedle(group);
  });

  // reset the two switches to false and update their button images
  state.bassPlusOn = false;
  state.distOn = false;
  const btnBass = document.getElementById("btn_bassplus");
  if (btnBass) btnBass.src = `/images/button1_off.jpg`;
  const btnDist = document.getElementById("btn_dist");
  if (btnDist) btnDist.src = `/images/button2_off.jpg`;
}

// ==========================================================
//  A I - G E N E R E R I N G
// ==========================================================
let engineOn = false;
let ignitionSound = null;
let qrCode = null;

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

async function generateSong() {
  const payload = buildPayload();

  setStatus("Genererar EPA-dunk…");

  console.log("🔥 PAYLOAD TILL SERVERN:", buildPayload());

  const res = await fetch("/api/generate-song", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload })
  });

  const data = await res.json();
  if (!data.success) {
      setStatus("Fel: " + data.error);
      return;
  }

  if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
  }

  const audio = new Audio(data.audioUrl);
  audio.loop = true;

  await new Promise(r => audio.addEventListener("canplaythrough", r, { once: true }));
  currentAudio = audio;

  // ensure needles stop/reset when playback ends or is paused
  audio.addEventListener("pause", () => stopVU());
  audio.addEventListener("ended", () => stopVU());

  if (!engineOn) {
      setStatus("Låt klar – men motorn är av.");
      return;
  }

  audio.currentTime = 0;
  audio.play();

  startBlink();
  startVU();

  setStatus("Spelar EPA-dunk! Skjut av QR-koden för att dela låten.");

  if (qrCode && data.publicUrl) {
      qrCode.clear();
      qrCode.makeCode(data.publicUrl);
  }
}

// ==========================================================
//  I N I T
// ==========================================================
window.addEventListener("load", () => {

  ["tempo","typ","energi","trummor"].forEach(setNeedle);

  document.querySelectorAll(".hotspot")
      .forEach(el => el.addEventListener("click", handleGaugeClick));

  document.getElementById("btn_bassplus")
      .addEventListener("click", () => toggleButton("btn_bassplus", "bassPlusOn"));

  document.getElementById("btn_dist")
      .addEventListener("click", () => toggleButton("btn_dist", "distOn"));

  // QR
  const qrEl = document.getElementById("qrcode");
  if (qrEl) qrCode = new QRCode(qrEl, { text: "", width: 160, height: 160 });

  ignitionSound = new Audio("/audio/ignition.wav");

  // Tändningsnyckel
  document.getElementById("ignition").addEventListener("click", () => {
      if (!engineOn) {
          engineOn = true;

          ignitionSound.currentTime = 0;
          ignitionSound.play();

          document.getElementById("ignition").style.transform = "rotate(45deg)";

          setLamp(3, true);
          setLamp(4, true);

          generateSong();
      } else {
          engineOn = false;

          if (currentAudio) currentAudio.pause();
          stopBlink();
          stopVU();
          allLampsOff();

          document.getElementById("ignition").style.transform = "rotate(0deg)";

          if (qrCode) qrCode.clear();

          setStatus("Stoppad.");
      }
  });

  resizeDashboard();
  setStatus("Justera visarna – vrid nyckeln för EPA-dunk!");
});
