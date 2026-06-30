require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(process.env.DATABASE_FILE || './data/licenses.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const connection = { filename: dbPath };

const pool = {
  min: 1,
  max: 1,
  afterCreate: (conn, done) => {
    conn.pragma('journal_mode = WAL');
    conn.pragma('foreign_keys = ON');
    done(null, conn);
  },
};

module.exports = {
  development: {
    client: 'better-sqlite3',
    connection,
    migrations: { directory: './migrations', tableName: 'knex_migrations' },
    seeds: { directory: './seeds' },
    useNullAsDefault: true,
    pool,
  },
  production: {
    client: 'better-sqlite3',
    connection,
    migrations: { directory: './migrations', tableName: 'knex_migrations' },
    useNullAsDefault: true,
    pool,
  },
};
