import { app } from './app.js';
import { initDb } from './db.js';

const PORT = process.env.API_PORT || 3001;

await initDb();

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
