import { Router } from 'express';
import path from 'path';
import { query } from '../db.js';

const router = Router();

router.get('/home', async (_req, res) => {
  const [users, projects, publications, events] = await Promise.all([
    query('SELECT COUNT(*)::int AS total FROM users'),
    query('SELECT COUNT(*)::int AS total FROM projects'),
    query('SELECT COUNT(*)::int AS total FROM publications'),
    query('SELECT COUNT(*)::int AS total FROM events')
  ]);

  const recentProjects = await query('SELECT id, title, description, status FROM projects ORDER BY created_at DESC LIMIT 4');
  const recentEvents = await query('SELECT id, title, description, date::text, location FROM events ORDER BY date ASC LIMIT 4');
  const homeContent = await query(
    'SELECT hero_badge, hero_title, hero_description FROM home_content ORDER BY updated_at DESC LIMIT 1'
  );

  res.json({
    hero: homeContent.rows[0] || {
      hero_badge: 'Plateforme scientifique',
      hero_title: 'Laboratoire InnovCom',
      hero_description:
        'Une plateforme unifiee pour valoriser la recherche en Telecommunications, IA, IoT et Cybersecurite.'
    },
    stats: {
      researchers: users.rows[0].total,
      projects: projects.rows[0].total,
      publications: publications.rows[0].total,
      events: events.rows[0].total
    },
    recentProjects: recentProjects.rows,
    recentEvents: recentEvents.rows
  });
});

router.get('/domains', (_req, res) => {
  res.json({
    items: [
      { key: 'ia', title: 'Intelligence Artificielle' },
      { key: 'telecom', title: 'Telecommunications' },
      { key: 'iot', title: 'Internet des Objets' },
      { key: 'cyber', title: 'Cybersecurite' }
    ]
  });
});

router.get('/projects', async (req, res) => {
  const search = `%${req.query.q || ''}%`;
  const result = await query(
    `
      SELECT id, title, description, technologies, status
      FROM projects
      WHERE title ILIKE $1 OR description ILIKE $1 OR technologies ILIKE $1 OR status ILIKE $1
      ORDER BY created_at DESC
    `,
    [search]
  );

  res.json({ items: result.rows });
});

router.get('/publications/:id/download', async (req, res) => {
  const result = await query('SELECT pdf_url FROM publications WHERE id = $1', [req.params.id]);
  const publication = result.rows[0];

  if (!publication || !publication.pdf_url) {
    return res.status(404).json({ message: 'PDF introuvable pour cette publication' });
  }

  const pdfUrl = publication.pdf_url.trim();

  if (/^https?:\/\//i.test(pdfUrl)) {
    return res.redirect(pdfUrl);
  }

  const normalizedUploadPath = pdfUrl.startsWith('/uploads/') ? pdfUrl : pdfUrl.startsWith('uploads/') ? `/${pdfUrl}` : null;
  if (normalizedUploadPath) {
    return res.redirect(normalizedUploadPath);
  }

  const looksLikeWindowsPath = /^[a-zA-Z]:\\/.test(pdfUrl);
  const inProjectUploads = /[\\/]backend[\\/]uploads[\\/]/i.test(pdfUrl);
  if (looksLikeWindowsPath && inProjectUploads) {
    const fileName = path.win32.basename(pdfUrl);
    return res.redirect(`/uploads/${encodeURIComponent(fileName)}`);
  }

  return res.status(400).json({
    message:
      'Chemin PDF local non supporte en direct. Place le fichier dans backend/uploads puis utilise /uploads/nom-du-fichier.pdf dans le champ PDF.'
  });
});

router.get('/publications', async (req, res) => {
  const search = `%${req.query.q || ''}%`;
  const result = await query(
    `
      SELECT id, title, authors, venue, pdf_url, EXTRACT(YEAR FROM created_at)::text AS year
      FROM publications
      WHERE title ILIKE $1 OR authors ILIKE $1 OR venue ILIKE $1
      ORDER BY created_at DESC
    `,
    [search]
  );

  res.json({ items: result.rows });
});

router.get('/events', async (_req, res) => {
  const result = await query('SELECT id, title, description, date::text, location FROM events ORDER BY date ASC');
  res.json({ items: result.rows });
});

router.get('/team', async (_req, res) => {
  const result = await query('SELECT id, full_name, role, speciality FROM users ORDER BY full_name ASC');
  res.json({ items: result.rows });
});

export default router;
