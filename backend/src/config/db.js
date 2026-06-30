const knex = require('knex');
const path = require('path');
const fs = require('fs');
const env = require('./env');

const dbPath = path.resolve(env.dbFile);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = knex({
  client: 'better-sqlite3',
  connection: { filename: dbPath },
  useNullAsDefault: true,
  pool: {
    min: 1,
    max: 1,
    afterCreate: (conn, done) => {
      conn.pragma('journal_mode = WAL');
      conn.pragma('foreign_keys = ON');
      done(null, conn);
    },
  },
});

module.exports = db;