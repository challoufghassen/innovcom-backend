import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(160) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'researcher',
      is_approved BOOLEAN NOT NULL DEFAULT FALSE,
      speciality VARCHAR(120) DEFAULT 'IA'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      title VARCHAR(220) NOT NULL,
      description TEXT NOT NULL,
      technologies TEXT NOT NULL,
      status VARCHAR(60) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS publications (
      id SERIAL PRIMARY KEY,
      title VARCHAR(260) NOT NULL,
      authors TEXT NOT NULL,
      venue VARCHAR(160) NOT NULL,
      pdf_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title VARCHAR(220) NOT NULL,
      description TEXT NOT NULL,
      date DATE NOT NULL,
      location VARCHAR(160) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS home_content (
      id SERIAL PRIMARY KEY,
      hero_badge VARCHAR(120) NOT NULL DEFAULT 'Plateforme scientifique',
      hero_title VARCHAR(220) NOT NULL DEFAULT 'Laboratoire InnovCom',
      hero_description TEXT NOT NULL DEFAULT 'Une plateforme unifiee pour valoriser la recherche en Telecommunications, IA, IoT et Cybersecurite.',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE`);
}
