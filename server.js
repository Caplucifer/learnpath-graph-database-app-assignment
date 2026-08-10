require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { runQuery, verifyConnection, closeDriver } = require('./db');
const Q = require('./queries');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Small helper so every route reports DB errors the same, friendly way
// instead of the app crashing when CognoDB is unreachable.
function handleDbError(res, err) {
  console.error(err);
  const unavailable = err.code === 'DB_UNAVAILABLE';
  res.status(unavailable ? 503 : 500).json({
    error: unavailable
      ? 'Database is not reachable right now. Please check the connection and try again.'
      : 'Something went wrong running that query.',
  });
}

app.get('/api/health', async (req, res) => {
  const status = await verifyConnection();
  res.status(status.ok ? 200 : 503).json(status);
});

app.get('/api/courses', async (req, res) => {
  try {
    const records = await runQuery(Q.LIST_COURSES);
    res.json(records.map(r => ({ ...r.get('course'), category: r.get('category') })));
  } catch (err) { handleDbError(res, err); }
});

app.get('/api/skills', async (req, res) => {
  try {
    const records = await runQuery(Q.LIST_SKILLS);
    res.json(records.map(r => r.get('name')));
  } catch (err) { handleDbError(res, err); }
});

app.get('/api/search', async (req, res) => {
  try {
    const term = req.query.q || '';
    const records = await runQuery(Q.SEARCH_COURSES, { term });
    res.json(records.map(r => r.get('course')));
  } catch (err) { handleDbError(res, err); }
});

app.get('/api/courses/:id', async (req, res) => {
  try {
    const records = await runQuery(Q.GET_COURSE, { id: req.params.id });
    if (records.length === 0) return res.status(404).json({ error: 'Course not found' });
    const r = records[0];
    const [direct, unlocks, chain, unlockChain] = await Promise.all([
      runQuery(Q.DIRECT_PREREQS, { id: req.params.id }),
      runQuery(Q.DIRECT_UNLOCKS, { id: req.params.id }),
      runQuery(Q.FULL_PREREQUISITE_CHAIN, { id: req.params.id }),
      runQuery(Q.FULL_UNLOCK_CHAIN, { id: req.params.id }),
    ]);
    res.json({
      ...r.get('course'),
      category: r.get('category'),
      skills: r.get('skills'),
      directPrerequisites: direct.map(x => x.get('course')),
      directUnlocks: unlocks.map(x => x.get('course')),
      fullPrerequisiteChain: chain.map(x => ({ ...x.get('course'), depth: x.get('depth').toNumber?.() ?? x.get('depth') })),
      fullUnlockChain: unlockChain.map(x => ({ ...x.get('course'), depth: x.get('depth').toNumber?.() ?? x.get('depth') })),
    });
  } catch (err) { handleDbError(res, err); }
});

app.get('/api/path', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Both "from" and "to" course ids are required.' });
    const records = await runQuery(Q.SHORTEST_PATH, { fromId: from, toId: to });
    if (records.length === 0) return res.json({ nodes: [], hops: null, connected: false });
    const r = records[0];
    res.json({ nodes: r.get('nodes'), hops: r.get('hops').toNumber?.() ?? r.get('hops'), connected: true });
  } catch (err) { handleDbError(res, err); }
});

app.get('/api/skills/:name/courses', async (req, res) => {
  try {
    const records = await runQuery(Q.SKILL_EXPANSION, { skillName: req.params.name });
    res.json(records.map(r => ({ course: r.get('course'), opensUpSkills: r.get('opensUpSkills') })));
  } catch (err) { handleDbError(res, err); }
});

// Fallback to the SPA shell for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  console.log(`LearnPath server running on http://localhost:${PORT}`);
  const status = await verifyConnection();
  if (!status.ok) {
    console.warn('⚠️  Could not connect to CognoDB:', status.error);
    console.warn('   The app will still start, but API calls will return 503 until the DB is reachable.');
  } else {
    console.log('✅ Connected to CognoDB');
  }
});

process.on('SIGTERM', async () => { await closeDriver(); server.close(); });
process.on('SIGINT', async () => { await closeDriver(); server.close(); process.exit(0); });
