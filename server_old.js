/********************************************************************
 * EPA-DUNK SERVER — SYNCAD MED FRONTEND
 ********************************************************************/

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

const AWS_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION;
const AWS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY;

const TRACKS_DIR = path.join(__dirname, "public/tracks");
if (!fs.existsSync(TRACKS_DIR)) fs.mkdirSync(TRACKS_DIR, { recursive: true });

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_KEY,
    secretAccessKey: AWS_SECRET
  }
});

// ----------------------------------------------------------
// PROMPTMOTOR — SAMMA SOM I FRONTEND
// ----------------------------------------------------------
function buildStablePrompt(options) {
  const { tempo, typ, energi, trummor, bass, bassPlus, dist } = options;

  const distText = dist
    ? "with aggressive distortion, clipped harmonics and EPA-style bite"
    : "with cleaner tone";

  const bassPlusText = bassPlus
    ? "with extreme boosted sub-bass for speaker-rattling power"
    : "with normal low-end balance";

  return `
Create a 30-second instrumental EPA-dunk inspired track that MUST vary EXTREMELY
based on these descriptions.

Tempo: ${tempo} BPM.

Style character:
${typ}

Energy profile:
${energi}

Drums:
${trummor}

Bass:
${bass}, ${bassPlusText}

Lead synths:
follows the style+energy, ${distText}

IMPORTANT RULES:
- LOW values = soft retro eurodance / italodisco
- MID values = modern EDM / dance-pop
- HIGH values = EXTREME EPA-DUNK / hardstyle hybrid

Track MUST clearly change character depending on values.
Arrangement loop-friendly. Instrumental only. No vocals.
`.trim();
}

// ----------------------------------------------------------
// GENERERA MED STABLE AUDIO
// ----------------------------------------------------------
async function generateSongWithStableAudio(payload) {

  const promptText = buildStablePrompt(payload);

  console.log("\n🔥🔥 SERVER SKICKAR TILL STABLE AUDIO:\n");
  console.log(promptText);
  console.log("\n🔥🔥 SLUT PÅ PROMPT\n");

  const formData = new FormData();
  formData.append("prompt", promptText);
  formData.append("output_format", "mp3");
  formData.append("duration", "30");
  formData.append("model", "stable-audio-2.5");

  const resp = await axios.post(
    "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
    formData,
    {
      responseType: "arraybuffer",
      validateStatus: () => true,
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        Accept: "audio/*",
        ...formData.getHeaders()
      },
      timeout: 180000
    }
  );

  if (resp.status !== 200) {
    throw new Error("Stable Audio error " + resp.status);
  }

  const filename = `epa_${Date.now()}_${randomUUID().slice(0, 8)}.mp3`;
  const buffer = Buffer.from(resp.data);

  fs.writeFileSync(path.join(TRACKS_DIR, filename), buffer);

  const s3Url = await uploadToS3(buffer, filename);

  return {
    relUrl: "/tracks/" + filename,
    publicUrl: s3Url
  };
}

// UPLOAD
async function uploadToS3(buffer, filename) {
  const cmd = new PutObjectCommand({
    Bucket: AWS_BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: "audio/mpeg",
  });

  await s3.send(cmd);

  return `https://${AWS_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${filename}`;
}

// ----------------------------------------------------------
// API
// ----------------------------------------------------------
app.post("/api/generate-song", async (req, res) => {
  try {
    console.log("\n🎶 Mottog payload:", req.body);

    const result = await generateSongWithStableAudio(req.body);

    res.json({
      success: true,
      audioUrl: result.relUrl,
      publicUrl: result.publicUrl
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------
app.listen(PORT, () =>
  console.log(`🚀 EPA-dunk server running on http://localhost:${PORT}`)
);
