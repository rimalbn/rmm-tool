require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Mount API handlers
const routes = ['auth', 'devices', 'heartbeat', 'tickets', 'comments', 'users'];
for (const r of routes) {
  const handler = require(`./api/${r}`);
  app.all(`/api/${r}`, (req, res) => handler(req, res));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RMM running at http://localhost:${PORT}`));
