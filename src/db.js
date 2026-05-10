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
      role VARCHAR(60) NOT NULL DEFAULT 'researcher',
      is_approved BOOLEAN NOT NULL DEFAULT FALSE,
      speciality VARCHAR(120) DEFAULT 'IA'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      title VARCHAR(220) NOT NULL,
      description TEXT NOT NULL,
      technologies TEXT NOT NULL,
      status VARCHAR(60) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
      last_update_title VARCHAR(220),
      last_update_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_sessions (
      id SERIAL PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      title VARCHAR(220) NOT NULL,
      description TEXT,
      speaker_name VARCHAR(120),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      day VARCHAR(60) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(60)`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS team TEXT`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS partners TEXT`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS details TEXT`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS results TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS background_color VARCHAR(20)`);
  await query(`ALTER TABLE publications ADD COLUMN IF NOT EXISTS background_color VARCHAR(20)`);
  await query(`ALTER TABLE publications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  
  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type VARCHAR(50) NOT NULL, -- 'project' or 'publication'
      target_id INTEGER NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'like', 'bravo', 'support', 'love', 'insightful', 'funny'
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type VARCHAR(50) NOT NULL,
      target_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`ALTER TABLE home_content ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await query(`ALTER TABLE home_content ADD COLUMN IF NOT EXISTS last_update_title VARCHAR(220)`);
  
  // Seed home content if table is empty
  const checkHome = await query('SELECT id FROM home_content LIMIT 1');
  if (checkHome.rows.length === 0) {
    await query(`
      INSERT INTO home_content (hero_badge, hero_title, hero_description)
      VALUES ('Plateforme scientifique', 'Laboratoire InnovCom', 'Une plateforme unifiee pour valoriser la recherche en Telecommunications, IA, IoT et Cybersecurite.')
    `);
  }
}
