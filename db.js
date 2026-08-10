// db.js
// Central place that owns the CognoDB (openCypher-over-Bolt) driver.
// CognoDB speaks the same Bolt protocol as Neo4j, so the official neo4j-driver
// package works unmodified - we just point it at the CognoDB URI.

require('dotenv').config();
const neo4j = require('neo4j-driver');

const URI = process.env.COGNODB_URI;
const USER = process.env.COGNODB_USER;
const PASSWORD = process.env.COGNODB_PASSWORD;

let driver = null;
let driverError = null;

function getDriver() {
  if (driver) return driver;
  if (!URI || !USER || !PASSWORD) {
    driverError = 'Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD environment variables.';
    return null;
  }
  try {
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD), {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 10000,
    });
    return driver;
  } catch (err) {
    driverError = err.message;
    return null;
  }
}

// Verifies connectivity - used by /api/health and on server startup.
async function verifyConnection() {
  const d = getDriver();
  if (!d) return { ok: false, error: driverError || 'Driver not initialised' };
  try {
    await d.verifyConnectivity();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Runs a single Cypher query inside a managed session, always as a
// PARAMETERISED query - callers must never string-concatenate Cypher.
async function runQuery(cypher, params = {}) {
  const d = getDriver();
  if (!d) {
    const err = new Error(driverError || 'Database driver is not configured.');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  const session = d.session({ database: 'neo4j' });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } catch (err) {
    err.code = err.code || 'DB_QUERY_FAILED';
    throw err;
  } finally {
    await session.close();
  }
}

async function closeDriver() {
  if (driver) await driver.close();
}

module.exports = { getDriver, verifyConnection, runQuery, closeDriver };
