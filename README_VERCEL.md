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
