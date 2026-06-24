const axios = require('axios');
const cron = require('node-cron');
const db = require('./db');

async function pingMonitor(monitor) {
  const start = Date.now();
  try {
    const res = await axios.get(monitor.url, {
      timeout: 15000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'PingBoard-Monitor/1.0' },
      maxRedirects: 5
    });
    const responseTime = Date.now() - start;
    const isUp = res.status >= 200 && res.status < 400;
    await db.recordPing(monitor.id, isUp, responseTime, res.status, null);
  } catch (err) {
    const responseTime = Date.now() - start;
    const msg = (err.code || err.message || 'Unknown error').substring(0, 200);
    await db.recordPing(monitor.id, false, responseTime, null, msg);
  }
}

async function pingAll() {
  try {
    const monitors = await db.getAllMonitors();
    if (monitors.length === 0) return;
    await Promise.allSettled(monitors.map(m => pingMonitor(m)));
    console.log(`[${new Date().toISOString()}] Pinged ${monitors.length} monitor(s)`);
  } catch (err) {
    console.error('Error in pingAll:', err.message);
  }
}

function startMonitoring() {
  // Ping every minute
  cron.schedule('* * * * *', pingAll);
  // Clean old pings at 2am daily
  cron.schedule('0 2 * * *', db.cleanOldPings);
  console.log('Monitoring started — checking every minute');
  pingAll();
}

module.exports = { startMonitoring };
