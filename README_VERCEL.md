# Deploy Mutqin AI Gemini ke Vercel

Project ini sudah disiapkan untuk Vercel. Backend Express diekspor dari `server.js`, sehingga Vercel bisa menjalankannya sebagai function.

## Langkah singkat

1. Push folder project ke GitHub.
2. Masuk Vercel → Add New Project.
3. Import repo.
4. Tambahkan Environment Variables:
   - `GEMINI_API_KEY`
   - `GEMINI_ANALYSIS_MODEL=gemini-2.5-flash`
   - `GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash`
   - `GEMINI_COACH_MODEL=gemini-2.5-flash`
5. Deploy.

Tanpa `GEMINI_API_KEY`, aplikasi tetap bisa dibuka. Fitur lokal dan Live Setor V2 browser tetap bisa dicoba, tapi Transkrip Gemini, Analisis Gemini, dan Coach API belum aktif.


## Update: Natural Checkpoint Fix
- Live Setor sekarang tidak lagi meminta user mengulang dari potongan yang menggantung seperti “الله الرحمن”.
- Jika error terjadi di awal ayat/frasa pendek, aplikasi akan mengarahkan ulang dari awal frasa/ayat, misalnya “بسم الله الرحمن الرحيم”.
- Jika browser hanya belum menangkap kata terakhir, aplikasi menandainya sebagai “belum tertangkap”, bukan langsung salah.
- Recovery flow tetap melanjutkan dari checkpoint, bukan restart seluruh setoran.

## Listening Accuracy Fix

Versi ini menambahkan pemilihan kandidat transkrip terbaik, confidence filter, toleransi pemisahan/penggabungan kata, dan normalisasi bacaan Latin umum untuk meningkatkan akurasi Live Setor di mobile.
