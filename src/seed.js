import bcrypt from 'bcryptjs';
import { query } from './db.js';

export async function seedIfEmpty() {
  const adminHash = await bcrypt.hash('admin123', 10);

  await query(
    `
    INSERT INTO users (full_name, email, password_hash, role, is_approved, speciality)
    VALUES
      ('Admin InnovCom', 'admin@innovcom.local', $1, 'superadmin', TRUE, 'Gouvernance'),
      ('Dr. Lina Bensalem', 'lina@innovcom.local', $1, 'researcher', TRUE, 'IA'),
      ('Dr. Sami Khoufi', 'sami@innovcom.local', $1, 'researcher', TRUE, 'Telecommunications')
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      is_approved = EXCLUDED.is_approved,
      speciality = EXCLUDED.speciality
    `,
    [adminHash]
  );

  const [projectsCount, publicationsCount, eventsCount, homeContentCount] = await Promise.all([
    query('SELECT COUNT(*)::int AS total FROM projects'),
    query('SELECT COUNT(*)::int AS total FROM publications'),
    query('SELECT COUNT(*)::int AS total FROM events'),
    query('SELECT COUNT(*)::int AS total FROM home_content')
  ]);

  if (projectsCount.rows[0].total === 0) {
    await query(
      `
      INSERT INTO projects (title, description, technologies, status)
      VALUES
        ('RAN Optimizer 6G', 'Optimisation dynamique de ressources radio pour reseaux 6G.', 'Python, ML, 6G, Kubernetes', 'En cours'),
        ('Smart City IoT Mesh', 'Plateforme de supervision de capteurs urbains IoT.', 'Node.js, MQTT, React, PostgreSQL', 'Prototype'),
        ('AI Edge Vision', 'Inference IA temps reel sur edge devices.', 'PyTorch, ONNX, Edge TPU', 'Termine')
      `
    );
  }

  if (publicationsCount.rows[0].total === 0) {
    await query(
      `
      INSERT INTO publications (title, authors, venue, pdf_url)
      VALUES
        ('Adaptive Scheduling for 6G Slices', 'L. Bensalem, S. Khoufi', 'IEEE ICC 2025', 'https://example.com/paper-6g.pdf'),
        ('Efficient Edge Inference for Urban AI', 'A. Trabelsi, M. Rahal', 'ACM IoT Journal 2025', 'https://example.com/paper-edge.pdf')
      `
    );
  }

  if (eventsCount.rows[0].total === 0) {
    await query(
      `
      INSERT INTO events (title, description, date, location)
      VALUES
        ('Workshop IA appliquee', 'Atelier methodologique pour doctorants IA.', CURRENT_DATE + INTERVAL '15 days', 'Salle 204'),
        ('Seminaire 6G', 'Invites industriels autour des architectures Open RAN.', CURRENT_DATE + INTERVAL '30 days', 'Auditorium A')
      `
    );
  }

  if (homeContentCount.rows[0].total === 0) {
    await query(
      `
      INSERT INTO home_content (hero_badge, hero_title, hero_description)
      VALUES (
        'Plateforme scientifique',
        'Laboratoire InnovCom',
        'Une plateforme unifiee pour valoriser la recherche en Telecommunications, IA, IoT et Cybersecurite.'
      )
      `
    );
  }
}
