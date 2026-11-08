// Side-effect module: main.ts imports it first, so `.env` is loaded before any
// other module reads process.env (e.g. ObserveModule.forRoot at import time).
// Variables already set in the real environment win over the file.
// In Docker/production the env comes from the container, so a missing file is fine.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
