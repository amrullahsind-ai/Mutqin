[Updated] Live Setor now uses full-page live mushaf mode and hides live transcript from the UI.

# Mutqin AI — Gemini Polished Edition

Versi ini adalah prototype tahfizh yang sudah diarahkan ke **Gemini API** dan UI/UX yang lebih “produk beneran”: glassmorphism, animasi halus, micro-interaction, live setor V2, dan coach yang lebih hidup.

## Yang berubah dari versi sebelumnya

- Backend OpenAI diganti ke **Gemini API**.
- Environment variable utama sekarang `GEMINI_API_KEY`.
- Tombol `Transkrip API` diganti menjadi **Transkrip Gemini**.
- Tombol `Analisis AI API` diganti menjadi **Analisis Gemini**.
- AI Coach sekarang mencoba memakai `/api/coach` Gemini, lalu fallback ke coach lokal kalau key belum aktif.
- UI/UX dipoles: animasi view, card hover, orb background, Gemini badge, live token animation, tombol lebih premium.
- Live Setor V2 tetap pakai SpeechRecognition browser supaya gratis dan cepat.

## Cara jalanin lokal

```bash
npm install
cp .env.example .env
npm start
```

Buka:

```text
http://localhost:3000
```

Isi `.env`:

```env
GEMINI_API_KEY=isi_api_key_gemini_kamu
GEMINI_ANALYSIS_MODEL=gemini-2.5-flash
GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash
GEMINI_COACH_MODEL=gemini-2.5-flash
```

## Cara deploy ke Vercel

1. Upload project ini ke GitHub.
2. Buka Vercel.
3. Add New Project.
4. Import repo.
5. Framework: Other.
6. Install command: `npm install`.
7. Start/build biarkan default, karena `server.js` sudah export Express app untuk Vercel.
8. Tambahkan Environment Variables:
   - `GEMINI_API_KEY`
   - `GEMINI_ANALYSIS_MODEL=gemini-2.5-flash`
   - `GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash`
   - `GEMINI_COACH_MODEL=gemini-2.5-flash`
9. Deploy.

## Catatan penting

- Jangan taruh API key di `public/app.js` atau frontend.
- Live Setor V2 tetap gratis karena memakai browser speech recognition.
- Gemini dipakai untuk transkrip rekaman, analisis setelah setoran, dan coach.
- Untuk tajwid/makhraj, hasil AI tetap harus dianggap indikasi awal, bukan penilaian final.
- Progress masih tersimpan di `localStorage`, jadi belum sinkron antar perangkat.

## Struktur

```text
server.js                  # Backend Express + Gemini API
public/index.html          # UI utama
public/app.js              # Logic frontend, live setor, local state
public/styles.css          # UI/UX polished + animasi
.env.example               # Contoh env Gemini
render.yaml                # Opsional deploy Render
```
