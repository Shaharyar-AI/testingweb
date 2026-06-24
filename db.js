const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS monitors (
      id SERIAL PRIMARY KEY,
      dashboard_id INTEGER REFERENCES dashboards(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      url VARCHAR(1000) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pings (
      id SERIAL PRIMARY KEY,
      monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
      is_up BOOLEAN NOT NULL,
      response_time INTEGER,
      status_code INTEGER,
      error_message TEXT,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pings_monitor_checked ON pings(monitor_id, checked_at DESC);
  `);
}

async function createDashboard(slug, name) {
  const r = await pool.query(
    'INSERT INTO dashboards (slug, name) VALUES ($1, $2) RETURNING *',
    [slug, name]
  );
  return r.rows[0];
}

async function getDashboard(slug) {
  const r = await pool.query('SELECT * FROM dashboards WHERE slug = $1', [slug]);
  return r.rows[0] || null;
}

async function addMonitor(dashboardId, name, url) {
  const r = await pool.query(
    'INSERT INTO monitors (dashboard_id, name, url) VALUES ($1, $2, $3) RETURNING *',
    [dashboardId, name, url]
  );
  return r.rows[0];
}

async function getMonitorsByDashboard(dashboardId) {
  const r = await pool.query(
    'SELECT * FROM monitors WHERE dashboard_id = $1 ORDER BY created_at',
    [dashboardId]
  );
  return r.rows;
}

async function getAllMonitors() {
  const r = await pool.query('SELECT * FROM monitors');
  return r.rows;
}

async function recordPing(monitorId, isUp, responseTime, statusCode, errorMessage) {
  await pool.query(
    'INSERT INTO pings (monitor_id, is_up, response_time, status_code, error_message) VALUES ($1, $2, $3, $4, $5)',
    [monitorId, isUp, responseTime || null, statusCode || null, errorMessage || null]
  );
}

async function getMonitorStats(monitorId) {
  const r = await pool.query(
    `SELECT is_up, response_time, status_code, error_message, checked_at
     FROM pings
     WHERE monitor_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'
     ORDER BY checked_at DESC
     LIMIT 90`,
    [monitorId]
  );
  const pings = r.rows;
  const total = pings.length;
  const upCount = pings.filter(p => p.is_up).length;
  const uptime = total > 0 ? Math.round((upCount / total) * 100) : null;
  const times = pings.filter(p => p.response_time !== null).map(p => p.response_time);
  const avgResponseTime = times.length > 0
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : null;
  return {
    uptime,
    avgResponseTime,
    lastPing: pings[0] || null,
    recentPings: pings.slice(0, 45)
  };
}

async function deleteMonitor(id) {
  await pool.query('DELETE FROM monitors WHERE id = $1', [id]);
}

async function cleanOldPings() {
  await pool.query("DELETE FROM pings WHERE checked_at < NOW() - INTERVAL '7 days'");
  console.log('Cleaned old pings');
}

module.exports = {
  initDB,
  createDashboard,
  getDashboard,
  addMonitor,
  getMonitorsByDashboard,
  getAllMonitors,
  recordPing,
  getMonitorStats,
  deleteMonitor,
  cleanOldPings
};
