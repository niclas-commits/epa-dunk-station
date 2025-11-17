/************************************************************
 *  EPA-DUNK STATION — FRONTEND (synkad med servern)
 ************************************************************/

// ----------------------------------------------------------
// 4 NÅLAR
// ----------------------------------------------------------
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
  trummor: 50,
};

// value→vinkel
function valueToAngle(group, value) {
  const g = gaugeConfig[group];
  return g.min + (g.max - g.min) * (value / 100);
}

function setNeedle(group) {
  const g = gaugeConfig[group];
  const angle = valueToAngle(group, gaugeValues[group]);
  const needle = document.getElementById(g.needleId);
  if (needle) {
    needle.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  }
}

let vuTimer = null;

function handleGaugeClick(e) {
  const group = e.currentTarget.dataset.group;
  const g = gaugeConfig[group];
  if (!g) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = e.clientX - cx;
  const dy = e.clientY - cy;

  let raw = Math.atan2(dy, dx) * 180 / Math.PI;
  let angle = raw + 90;

  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;

  if (angle < g.min || angle > g.max) return;

  const t = (angle - g.min) / (g.max - g.min);
  const value = Math.round(t * 100);

  gaugeValues[group] = value;
  setNeedle(group);
}

function startVU() {
  if (vuTimer) return;

  vuTimer = setInterval(() => {
    if (!currentAudio || currentAudio.paused) return;

    // Små variationer ± några grader runt den valda nivån
    ["typ", "energi"].forEach(group => {
      const base = gaugeValues[group];
      const wobble = Math.sin(Date.now() / 90) * 5; // amplitude
      const newVal = Math.max(0, Math.min(100, base + wobble));
      const angle = valueToAngle(group, newVal);

      const needle = document.getElementById(gaugeConfig[group].needleId);
      if (needle) {
        needle.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      }
    });
  }, 30);
}

function stopVU() {
  if (vuTimer) {
    clearInterval(vuTimer);
    vuTimer = null;
  }
}


// scaling
function resizeDashboard() {
  const dash = document.getElementById("dashboard");
  if (!dash) return;

  const scaleX = window.innerWidth / 1920;
  const scaleY = window.innerHeight / 1080;
  dash.style.setProperty("--scale", Math.min(scaleX, scaleY));
}
window.addEventListener("resize", resizeDashboard);
document.addEventListener("DOMContentLoaded", resizeDashboard);

// ----------------------------------------------------------
// BAS+ och DIST
// ----------------------------------------------------------
let bassPlusOn = false;
let distOn = false;

function toggleButton(id, stateVar) {
  const el = document.getElementById(id);
  const newState = !window[stateVar];
  window[stateVar] = newState;

  const imgBase = id === "btn_bassplus" ? "button1" : "button2";
  el.src = `/images/${imgBase}_${newState ? "on" : "off"}.jpg`;
}

// ----------------------------------------------------------
// L A M P O R  (blink)
// ----------------------------------------------------------
function lampSrc(i, on) {
  return `/images/lamp${i}_${on ? "on" : "off"}.jpg`;
}

function setLamp(i, on) {
  const el = document.getElementById("lamp" + i);
  if (el) el.src = lampSrc(i, on);
}

function allLampsOff() {
  for (let i = 1; i <= 9; i++) setLamp(i, false);
}

let blinkTimer = null;

function startBlink() {
  if (blinkTimer) return;
  blinkTimer = setInterval(() => {
    for (let i = 1; i <= 9; i++) {
      const el = document.getElementById("lamp" + i);
      if (!el) continue;
      const isOff = el.src.includes("_off");
      el.src = lampSrc(i, isOff);
    }
  }, 260);
}

function stopBlink() {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
  allLampsOff();
}

// ----------------------------------------------------------
// BESKRIVNINGSMOTOR — SAMMA SOM SERVERN ANVÄNDER
// ----------------------------------------------------------
function tempoFromValue(v) {
  return Math.round(96 + (194 - 96) * (v / 100));
}

function descType(v) {
  if (v < 33) return "retro 90s eurodance with lo-fi drum machines, plastic synths and naive hooks";
  if (v < 66) return "modern EDM / dance-pop hybrid with clean synths, bright top-end and tight compression";
  return "brutal EPA-dunk / hardstyle influenced with extreme loudness, clipped peaks and aggressive sound design";
}

function descEnergy(v) {
  if (v < 33) return "low-energy smooth groove with mellow dynamics";
  if (v < 66) return "medium-high intensity with punchy rhythmic movement";
  return "extreme EPA-style aggression with screaming leads and ultra-compressed mix";
}

function descDrums(v, e) {
  if (v < 33) return "retro eurodance drum machine: soft kick, light snare, bright hats";
  if (v < 66) return "tight modern EDM drums: punchy kick, wide clap, crisp hi-hats";
  let s = "hardstyle-influenced distorted EPA-dunk kick with explosive transient spike";
  if (e > 66) s += ", even more aggressive due to extreme energy";
  return s;
}

function descBass(e, t, bassPlus, dist) {
  let base = "";
  if (e < 33) base = "soft warm sub-bass with minimal distortion";
  else if (e < 66) base = "punchy EDM bass with moderate saturation";
  else base = "EXTREMELY distorted EPA-dunk bass with crushed dynamics";

  if (t < 33) base += ", retro analog texture";
  if (t > 66) base += ", modern hyper-digital tone";

  if (bassPlus) base += ", +10dB boosted sub for chest-rattling rumble";
  if (dist) base += ", overloaded distortion with harsh clipping";

  return base;
}

function descLead(e, t, dist) {
  let s = "";
  if (e < 33) s = "soft mellow eurodance lead";
  else if (e < 66) s = "bright EDM saw lead with rhythmic motion";
  else s = "EXTREME screaming EPA lead dominating the mix";

  if (t < 33) s += ", retro waveform character";
  if (t > 66) s += ", polished digital modern tone";

  if (dist) s += ", extra distortion bite";

  return s;
}

// ----------------------------------------------------------
// BYGG PAYLOAD TILL SERVERN
// ----------------------------------------------------------
function buildPayload() {
  const g = gaugeValues;

  return {
    tempo: gaugeValues.tempo,
    typ: gaugeValues.typ,
    energi: gaugeValues.energi,
    trummor: gaugeValues.trummor,
    bassPlus: bassPlusOn,
    dist: distOn
  };
}

// ----------------------------------------------------------
// AUDIO / AI
// ----------------------------------------------------------
let currentAudio = null;
let engineOn = false;
let qr = null;
let qrLabel = null;
let ignitionSound = null;

async function generateSong() {
  const payload = buildPayload();

  setStatus("Genererar EPA-dunk…");

  const res = await fetch("/api/generate-song", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.success) {
    setStatus("Fel: " + data.error);
    return;
  }

  if (currentAudio) currentAudio.pause();

  const audio = new Audio(data.audioUrl);
  audio.loop = true;

  await new Promise((resolve) => {
    audio.addEventListener("canplaythrough", resolve, { once: true });
  });

  currentAudio = audio;

  if (!engineOn) {
    setStatus("Låt klar – men motorn är av.");
    return;
  }

  audio.currentTime = 0;
  audio.play();
  setStatus("Spelar EPA-dunk!");
  startBlink();
  startVU();

  if (qr) {
    qr.clear();
    qr.makeCode(data.publicUrl);
  }
  if (qrLabel) qrLabel.textContent = data.publicUrl;
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

// ----------------------------------------------------------
// INIT
// ----------------------------------------------------------
window.addEventListener("load", () => {

  ["tempo", "typ", "energi", "trummor"].forEach(setNeedle);

  document.querySelectorAll(".hotspot")
    .forEach(el => el.addEventListener("click", handleGaugeClick));

  document.getElementById("btn_bassplus")
    .addEventListener("click", () => toggleButton("btn_bassplus", "bassPlusOn"));

  document.getElementById("btn_dist")
    .addEventListener("click", () => toggleButton("btn_dist", "distOn"));

  const qrDom = document.getElementById("qrcode");
  if (qrDom) qr = new QRCode(qrDom, { width: 160, height: 160, text: "" });
  qrLabel = document.getElementById("qr-label");

  ignitionSound = new Audio("/audio/ignition.wav");

  const ignition = document.getElementById("ignition");
  ignition.addEventListener("click", () => {

    if (!engineOn) {
      engineOn = true;
      ignition.style.transform = "rotate(45deg)";
      ignitionSound.currentTime = 0;
      ignitionSound.play();
      setStatus("Startar EPA-dunk…");
      generateSong();
    } else {
      engineOn = false;
      ignition.style.transform = "rotate(0deg)";
      if (currentAudio) currentAudio.pause();
      setStatus("Stoppad.");
      stopBlink();
      stopVU();
      if (qr) qr.clear();
      if (qrLabel) qrLabel.textContent = "";
    }
  });

  const btnShow = document.getElementById("btn-show-prompt");
  const preview = document.getElementById("prompt-preview");
  if (btnShow && preview) {
    btnShow.addEventListener("click", () => {
      preview.textContent = JSON.stringify(buildPayload(), null, 2);
      setStatus("Visar payload → server bygger prompten.");
    });
  }

  resizeDashboard();
});
