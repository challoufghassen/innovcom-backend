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

  const recentProjects = await query(`
    SELECT p.id, p.title, p.team, p.partners, p.details, p.results, p.background_color,
           u.id as author_id, u.full_name as author_name, u.role as author_role, u.speciality as author_speciality, u.avatar_url as author_avatar
    FROM projects p
    LEFT JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
    LIMIT 4
  `);
  const recentEvents = await query('SELECT id, title, description, date::text, location FROM events ORDER BY date ASC LIMIT 4');
  const homeContent = await query(
    'SELECT hero_badge, hero_title, hero_description, last_update_title FROM home_content ORDER BY updated_at DESC LIMIT 1'
  );

  res.json({
    hero: homeContent.rows[0] || {
      hero_badge: 'Plateforme scientifique',
      hero_title: 'Laboratoire InnovCom',
      hero_description:
        'Une plateforme unifiee pour valoriser la recherche en Telecommunications, IA, IoT et Cybersecurite.',
      last_update_title: null
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
  const userId = req.query.userId;
  const result = await query(
    `
      SELECT p.id, p.title, p.team, p.partners, p.details, p.results, p.background_color, u.full_name as author,
             (SELECT type FROM reactions WHERE target_type = 'project' AND target_id = p.id AND user_id = $2) as user_reaction,
             (SELECT COUNT(*)::int FROM reactions WHERE target_type = 'project' AND target_id = p.id) as reaction_count,
             (SELECT COUNT(*)::int FROM comments WHERE target_type = 'project' AND target_id = p.id) as comment_count,
             (SELECT u.full_name FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.target_type = 'project' AND r.target_id = p.id ORDER BY r.created_at DESC LIMIT 1) as last_reactor_name,
             (SELECT STRING_AGG(DISTINCT type, ',') FROM reactions WHERE target_type = 'project' AND target_id = p.id) as reaction_types
      FROM projects p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.title ILIKE $1 OR p.team ILIKE $1 OR p.partners ILIKE $1 OR p.details ILIKE $1 OR p.results ILIKE $1
      ORDER BY p.created_at DESC
    `,
    [search, userId || null]
  );

  const mapped = result.rows.map(row => ({
    ...row,
    userReaction: row.user_reaction,
    reactionCount: row.reaction_count,
    commentCount: row.comment_count,
    lastReactorName: row.last_reactor_name,
    reactionTypes: row.reaction_types ? row.reaction_types.split(',') : []
  }));

  res.json({ items: mapped });
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
  const userId = req.query.userId;
  const result = await query(
    `
      SELECT p.id, p.title, p.authors, p.venue, p.pdf_url, p.background_color, EXTRACT(YEAR FROM p.created_at)::text AS year,
             (SELECT type FROM reactions WHERE target_type = 'publication' AND target_id = p.id AND user_id = $2) as user_reaction,
             (SELECT COUNT(*)::int FROM reactions WHERE target_type = 'publication' AND target_id = p.id) as reaction_count,
             (SELECT COUNT(*)::int FROM comments WHERE target_type = 'publication' AND target_id = p.id) as comment_count,
             (SELECT u.full_name FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.target_type = 'publication' AND r.target_id = p.id ORDER BY r.created_at DESC LIMIT 1) as last_reactor_name,
             (SELECT STRING_AGG(DISTINCT type, ',') FROM reactions WHERE target_type = 'publication' AND target_id = p.id) as reaction_types
      FROM publications p
      WHERE p.title ILIKE $1 OR p.authors ILIKE $1 OR p.venue ILIKE $1
      ORDER BY p.created_at DESC
    `,
    [search, userId || null]
  );

  const mapped = result.rows.map(row => ({
    ...row,
    userReaction: row.user_reaction,
    reactionCount: row.reaction_count,
    commentCount: row.comment_count,
    lastReactorName: row.last_reactor_name,
    reactionTypes: row.reaction_types ? row.reaction_types.split(',') : []
  }));

  res.json({ items: mapped });
});

router.get('/events', async (_req, res) => {
  const result = await query('SELECT id, title, description, date::text, location FROM events ORDER BY date ASC');
  res.json({ items: result.rows });
});

router.get('/events/:eventId/sessions', async (req, res) => {
  const result = await query(
    'SELECT id, event_id, title, description, speaker_name, start_time::text, end_time::text, day FROM event_sessions WHERE event_id = $1 ORDER BY day ASC, start_time ASC',
    [req.params.eventId]
  );
  res.json(result.rows);
});

router.get('/team', async (_req, res) => {
  const result = await query('SELECT id, full_name, role, speciality, avatar_url FROM users ORDER BY full_name ASC');
  res.json({ items: result.rows });
});

router.get('/members/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await query('SELECT id, full_name, role, speciality, avatar_url FROM users WHERE id = $1', [id]);
    if (!user.rows[0]) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const projects = await query('SELECT id, title, team, partners, details, results, background_color FROM projects WHERE user_id = $1', [id]);
    const publications = await query('SELECT id, title, authors, venue, pdf_url, background_color, EXTRACT(YEAR FROM created_at)::text AS year FROM publications WHERE user_id = $1', [id]);

    res.json({
      profile: user.rows[0],
      projects: projects.rows,
      publications: publications.rows
    });
  } catch (error) {
    console.error('Error fetching member profile:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du profil' });
  }
});

export default router;
