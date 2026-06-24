const express = require('express');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const { startMonitoring } = require('./monitor');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/dashboards', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.redirect('/');
    const slug = generateSlug();
    await db.createDashboard(slug, name.trim().substring(0, 100));
    res.redirect(`/dashboard/${slug}`);
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

app.get('/dashboard/:slug', async (req, res) => {
  try {
    const dashboard = await db.getDashboard(req.params.slug);
    if (!dashboard) return res.status(404).render('404');
    const monitors = await db.getMonitorsByDashboard(dashboard.id);
    const monitorsWithStats = await Promise.all(
      monitors.map(async (m) => ({ ...m, ...(await db.getMonitorStats(m.id)) }))
    );
    res.render('dashboard', { dashboard, monitors: monitorsWithStats });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/dashboard/:slug/monitors', async (req, res) => {
  try {
    const dashboard = await db.getDashboard(req.params.slug);
    if (!dashboard) return res.status(404).send('Not found');
    let { name, url } = req.body;
    if (!name || !url) return res.redirect(`/dashboard/${req.params.slug}`);
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    await db.addMonitor(dashboard.id, name.trim().substring(0, 100), url.substring(0, 500));
    res.redirect(`/dashboard/${req.params.slug}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/dashboard/${req.params.slug}`);
  }
});

app.post('/dashboard/:slug/monitors/:id/delete', async (req, res) => {
  try {
    await db.deleteMonitor(parseInt(req.params.id));
  } catch (err) {
    console.error(err);
  }
  res.redirect(`/dashboard/${req.params.slug}`);
});

app.get('/api/dashboard/:slug', async (req, res) => {
  try {
    const dashboard = await db.getDashboard(req.params.slug);
    if (!dashboard) return res.status(404).json({ error: 'Not found' });
    const monitors = await db.getMonitorsByDashboard(dashboard.id);
    const monitorsWithStats = await Promise.all(
      monitors.map(async (m) => ({ ...m, ...(await db.getMonitorStats(m.id)) }))
    );
    res.json({ dashboard, monitors: monitorsWithStats });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

function generateSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 10; i++) slug += chars[Math.floor(Math.random() * chars.length)];
  return slug;
}

async function main() {
  await db.initDB();
  startMonitoring();
  app.listen(PORT, () => console.log(`PingBoard running → http://localhost:${PORT}`));
}

main().catch(console.error);
