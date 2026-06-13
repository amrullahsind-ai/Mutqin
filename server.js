import '@dotenvx/dotenvx/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 18 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key || key.includes('isi_api_key')) {
    const err = new Error('GEMINI_API_KEY belum disetel. Buat file .env dari .env.example lalu isi API key Gemini dari Google AI Studio.');
    err.status = 500;
    throw err;
  }
  return key;
}

function safeJsonParse(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '';
}

async function callGemini({ model, contents, systemInstruction, generationConfig }) {
  const key = getGeminiKey();
  const safeModel = encodeURIComponent(model || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents,
      generationConfig
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message || `Gemini API error ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }
  return { data, text: extractGeminiText(data) };
}

function normalizeScore(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

app.get('/api/health', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('isi_api_key'));
  res.json({
    ok: true,
    provider: 'gemini',
    hasKey,
    analysisModel: process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash',
    transcribeModel: process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash'
  });
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File audio belum dikirim.' });
    const model = process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
    const targetText = String(req.body.targetText || '').slice(0, 5000);
    const audioBase64 = req.file.buffer.toString('base64');

    const systemInstruction = `Kamu adalah mesin transkripsi audio setoran hafalan Al-Qur'an.
Tugasmu hanya menuliskan transkrip Arab dari audio user.
Aturan:
- Jangan memberi penilaian tajwid.
- Jangan menambah teks yang tidak terdengar.
- Jika audio tidak jelas, tulis bagian yang terdengar dan beri penanda [tidak jelas] seperlunya.
- Untuk huruf muqatta'ah seperti الم, boleh transkrip sebagai bentuk yang paling mungkin berdasarkan audio.`;

    const prompt = targetText
      ? `Transkripsikan audio setoran ini ke teks Arab. Target bacaan yang sedang disetor untuk konteks pencocokan adalah: ${targetText}`
      : 'Transkripsikan audio setoran ini ke teks Arab.';

    const { text } = await callGemini({
      model,
      systemInstruction,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: req.file.mimetype || 'audio/webm', data: audioBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    });

    res.json({
      text,
      model,
      provider: 'gemini',
      warning: 'Transkripsi Gemini selesai. Tetap cek ulang, karena audio tilawah/Arab bisa salah tangkap terutama huruf muqatta\'ah dan waqaf.'
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Gagal transkripsi audio dengan Gemini.' });
  }
});

app.post('/api/analyze-submission', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.transcript || !body.targetText) return res.status(400).json({ error: 'transcript dan targetText wajib ada.' });
    const model = process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';

    const systemInstruction = `Kamu adalah AI Tahfizh Coach untuk aplikasi hafalan Al-Qur'an.
Tugasmu mendiagnosis hafalan dari transkrip bacaan user dibanding target ayat.
Batasan penting:
- Jangan mengklaim koreksi tajwid/makhraj final.
- Jangan menulis ulang ayat Al-Qur'an secara panjang kecuali potongan sangat pendek yang diperlukan.
- Fokus pada hafalan: kelengkapan, urutan, sambungan ayat, indikasi lupa, ketergantungan bantuan, dan latihan berikutnya.
- Kalau transkrip terlihat kacau/tidak Arab, skor rendah dan sarankan setor ulang.
- Output harus JSON valid saja, tanpa markdown.`;

    const expectedShape = {
      overallScore: 'number 0-100',
      similarityEstimate: 'number 0-100',
      coverageEstimate: 'number 0-100',
      summary: 'ringkasan singkat dalam bahasa Indonesia',
      notes: ['catatan praktis'],
      mistakeTypes: ['pilih dari: lupa kata, urutan/kata rawan, sambungan ayat, jeda panjang, tergantung bantuan, tertukar ayat mirip, stabil, perlu setor ulang'],
      nextDrills: ['latihan berikutnya yang konkret'],
      ayahs: [{ ayah: 'number', score: 'number 0-100', status: 'new|weak|shaky|strong', mistakes: ['string'], comment: 'string' }]
    };

    const payload = {
      expectedJsonShape: expectedShape,
      surahNumber: body.surahNumber,
      surahName: body.surahName,
      startAyah: body.startAyah,
      endAyah: body.endAyah,
      ayahs: body.ayahs,
      targetText: body.targetText,
      transcript: body.transcript,
      selfFluency: body.selfFluency,
      helpUsed: body.helpUsed,
      currentProgress: body.currentProgress
    };

    const { text } = await callGemini({
      model,
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    });

    const parsed = safeJsonParse(text);
    if (!parsed) return res.status(500).json({ error: 'Gemini tidak mengembalikan JSON valid.', raw: text });

    const normalized = {
      overallScore: normalizeScore(parsed.overallScore),
      similarityEstimate: normalizeScore(parsed.similarityEstimate, normalizeScore(parsed.overallScore)),
      coverageEstimate: normalizeScore(parsed.coverageEstimate, normalizeScore(parsed.overallScore)),
      summary: String(parsed.summary || 'Setoran dianalisis oleh Gemini.'),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String).slice(0, 8) : [],
      mistakeTypes: Array.isArray(parsed.mistakeTypes) ? parsed.mistakeTypes.map(String).slice(0, 8) : [],
      nextDrills: Array.isArray(parsed.nextDrills) ? parsed.nextDrills.map(String).slice(0, 8) : [],
      ayahs: Array.isArray(parsed.ayahs) ? parsed.ayahs.map(item => ({
        ayah: Number(item.ayah),
        score: normalizeScore(item.score, normalizeScore(parsed.overallScore)),
        status: ['new','weak','shaky','strong'].includes(item.status) ? item.status : (normalizeScore(item.score, normalizeScore(parsed.overallScore)) >= 85 ? 'strong' : normalizeScore(item.score, 0) >= 65 ? 'shaky' : 'weak'),
        mistakes: Array.isArray(item.mistakes) ? item.mistakes.map(String).slice(0, 5) : [],
        comment: String(item.comment || '')
      })).filter(item => Number.isFinite(item.ayah)) : [],
      provider: 'gemini',
      model
    };

    res.json(normalized);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Gagal analisis setoran dengan Gemini.' });
  }
});

app.post('/api/realtime-session', async (req, res) => {
  res.status(501).json({
    error: 'Live API belum diaktifkan di build gratis ini.',
    note: 'Mode Live Setor V2 memakai SpeechRecognition browser supaya gratis. Gemini dipakai untuk transkrip rekaman, analisis setoran, dan coach.'
  });
});

app.post('/api/coach', async (req, res) => {
  try {
    const model = process.env.GEMINI_COACH_MODEL || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
    const message = String(req.body?.message || '').slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'message wajib ada.' });
    const systemInstruction = `Kamu adalah AI Tahfizh Coach yang hangat, praktis, dan aman.
Jawab ringkas dalam bahasa Indonesia.
Fokus pada strategi hafalan, murajaah, konsistensi, dan diagnosis kebiasaan belajar.
Jangan mengklaim koreksi tajwid/makhraj final.`;
    const { text } = await callGemini({
      model,
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 900 }
    });
    res.json({ text, provider: 'gemini', model });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Gagal menjalankan Gemini Coach.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Mutqin AI Gemini berjalan di http://localhost:${port}`);
  });
}

export default app;
