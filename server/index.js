import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Read colleagues.json from the parent assets folder
const dataPath = path.join(__dirname, '..', 'assets', 'colleagues.json');

function readData() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const list = JSON.parse(raw);
    return list;
  } catch (e) {
    return [];
  }
}

app.get('/api/colleagues', (req, res) => {
  res.json(readData());
});

app.get('/api/colleagues/:id', (req, res) => {
  const list = readData();
  const hit = list.find(p => p.id === req.params.id);
  if (!hit) return res.status(404).json({ error: 'not-found' });
  res.json(hit);
});

// Simple health endpoints for uptime checks (Render/UptimeRobot/etc.)
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain').send('ok');
});
app.head('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).end();
});
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain').send('ok');
});

// Alias for Render settings if Health Check Path is /healthz
app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain').send('ok');
});
app.head('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).end();
});

// Render.com expects a port from env
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});
