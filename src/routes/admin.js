import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

async function trackUpdate(title) {
  try {
    await query('UPDATE home_content SET last_update_title = $1, last_update_at = CURRENT_TIMESTAMP', [title]);
  } catch (err) {
    console.error('Failed to track update:', err);
  }
}
const assignableRoles = [
  'admin',
  'superadmin',
  'Directeur',
  'Professeur',
  'Maître de conférences',
  'Maître assistant',
  'Post-doctorat',
  'Doctorat',
  'Mastère',
  'Ingénieur'
];

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont autorises'));
    }
  }
});

router.use(authenticateToken);

router.get('/dashboard', async (_req, res) => {
  const [users, projects, publications, events] = await Promise.all([
    query('SELECT COUNT(*)::int AS total FROM users'),
    query('SELECT COUNT(*)::int AS total FROM projects'),
    query('SELECT COUNT(*)::int AS total FROM publications'),
    query('SELECT COUNT(*)::int AS total FROM events')
  ]);

  res.json({
    stats: {
      users: users.rows[0].total,
      projects: projects.rows[0].total,
      publications: publications.rows[0].total,
      events: events.rows[0].total
    }
  });
});

router.get('/users/pending', requireRole('admin'), async (_req, res) => {
  const result = await query(
    `
    SELECT id, full_name, email, speciality, role, is_approved
    FROM users
    WHERE is_approved = FALSE
    ORDER BY id DESC
    `
  );

  res.json({ items: result.rows });
});

router.get('/users', requireRole('superadmin'), async (_req, res) => {
  const result = await query(
    `
    SELECT id, full_name, email, speciality, role, is_approved
    FROM users
    ORDER BY id DESC
    `
  );

  res.json({ items: result.rows });
});

router.patch('/users/:id/approve', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role = 'researcher', speciality } = req.body;

  if (!assignableRoles.includes(role)) {
    return res.status(400).json({ message: 'Role invalide' });
  }

  if (req.user.role !== 'superadmin' && role !== 'researcher') {
    return res.status(403).json({ message: 'Seul un superadmin peut attribuer ce role' });
  }

  const result = await query(
    `
    UPDATE users
    SET is_approved = TRUE,
        role = $1,
        speciality = COALESCE($2, speciality)
    WHERE id = $3
    RETURNING id, full_name, email, role, speciality, is_approved
    `,
    [role, speciality || null, id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }

  return res.json(result.rows[0]);
});

router.delete('/users/:id/reject', requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id);

  const targetUser = await query(
    'SELECT id, full_name, email, role, is_approved FROM users WHERE id = $1',
    [userId]
  );

  if (!targetUser.rows[0]) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }

  const candidate = targetUser.rows[0];

  if (candidate.is_approved) {
    return res.status(400).json({ message: 'Ce compte est deja approuve' });
  }

  if (req.user.role !== 'superadmin' && candidate.role !== 'researcher') {
    return res.status(403).json({ message: 'Seul un superadmin peut rejeter ce compte' });
  }

  await query('DELETE FROM users WHERE id = $1', [userId]);
  return res.json({ message: 'Compte refuse et supprime' });
});

router.patch('/users/:id/role', requireRole('superadmin'), async (req, res) => {
  const { id } = req.params;
  const userId = Number(id);
  const { role, speciality, isApproved } = req.body;

  if (!role || !assignableRoles.includes(role)) {
    return res.status(400).json({ message: 'Role invalide' });
  }

  if (Number(req.user.sub) === userId && role !== 'superadmin') {
    return res.status(400).json({ message: 'Impossible de retrograder votre propre compte superadmin' });
  }

  if (role !== 'superadmin') {
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (!currentUser.rows[0]) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (currentUser.rows[0].role === 'superadmin') {
      const superadminsCount = await query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'superadmin'");
      if (superadminsCount.rows[0].total <= 1) {
        return res.status(400).json({ message: 'Le dernier superadmin ne peut pas etre retrograde' });
      }
    }
  }

  const result = await query(
    `
    UPDATE users
    SET role = $1,
        speciality = COALESCE($2, speciality),
        is_approved = COALESCE($3, is_approved)
    WHERE id = $4
    RETURNING id, full_name, email, role, speciality, is_approved
    `,
    [role, speciality || null, typeof isApproved === 'boolean' ? isApproved : null, userId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }

  return res.json(result.rows[0]);
});

router.delete('/users/:id', requireRole('superadmin'), async (req, res) => {
  const userId = Number(req.params.id);

  if (Number(req.user.sub) === userId) {
    return res.status(400).json({ message: 'Impossible de supprimer votre propre compte' });
  }

  const targetUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
  if (!targetUser.rows[0]) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }

  if (targetUser.rows[0].role === 'superadmin') {
    const superadminsCount = await query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'superadmin'");
    if (superadminsCount.rows[0].total <= 1) {
      return res.status(400).json({ message: 'Impossible de supprimer le dernier superadmin' });
    }
  }

  await query('DELETE FROM users WHERE id = $1', [userId]);
  return res.status(204).send();
});

router.get('/projects', requireRole('admin', 'researcher'), async (_req, res) => {
  const result = await query('SELECT id, title, description, technologies, status, team, partners, details, results, background_color FROM projects ORDER BY created_at DESC');
  res.json({ items: result.rows });
});

router.post('/projects', requireRole('admin'), async (req, res) => {
  const { title, team, partners, details, results, backgroundColor } = req.body;
  const userId = Number(req.user.sub);

  if (!title) {
    return res.status(400).json({ message: 'Le titre est requis' });
  }

  const result = await query(
    'INSERT INTO projects (title, description, technologies, status, team, partners, details, results, background_color, user_id) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9, $10) RETURNING id, title, team, partners, details, results, background_color',
    [title, title, 'N/A', 'Publié', team || '', partners || '', details || '', results || '', backgroundColor || '#FFFFFF', userId]
  );

  await trackUpdate(`Nouveau Projet: ${title}`);
  return res.status(201).json(result.rows[0]);
});

router.put('/projects/:id', requireRole('admin'), async (req, res) => {
  const { title, team, partners, details, results, backgroundColor } = req.body;
  const { id } = req.params;

  const result = await query(
    'UPDATE projects SET title = $1, team = $2, partners = $3, details = $4, results = $5, background_color = $6 WHERE id = $7 RETURNING id, title, team, partners, details, results, background_color',
    [title, team, partners, details, results, backgroundColor || '#FFFFFF', id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Projet introuvable' });
  }

  await trackUpdate(`Projet mis a jour: ${title}`);
  return res.json(result.rows[0]);
});

router.delete('/projects/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const result = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Projet introuvable' });
  }

  return res.status(204).send();
});

router.post('/publications/upload', requireRole('admin'), (req, res, next) => {
  uploadPdf.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Erreur Multer: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier PDF reçu' });
  }

  return res.status(201).json({
    fileName: req.file.filename,
    pdf_url: `/uploads/${req.file.filename}`
  });
});

router.get('/publications', requireRole('admin', 'researcher'), async (_req, res) => {
  const result = await query('SELECT id, title, authors, venue, pdf_url, background_color FROM publications ORDER BY created_at DESC');
  res.json({ items: result.rows });
});

router.post('/publications', requireRole('admin'), async (req, res) => {
  const { title, authors, venue, pdf_url, backgroundColor } = req.body;

  if (!title || !authors || !venue) {
    return res.status(400).json({ message: 'Les champs titre, auteurs et revue sont requis' });
  }

  const result = await query(
    'INSERT INTO publications (title, authors, venue, pdf_url, background_color) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, authors, venue, pdf_url, background_color',
    [title, authors, venue, pdf_url || null, backgroundColor || '#FFFFFF']
  );

  await trackUpdate(`Nouvelle Publication: ${title}`);
  return res.status(201).json(result.rows[0]);
});

router.put('/publications/:id', requireRole('admin'), async (req, res) => {
  const { title, authors, venue, pdf_url, backgroundColor } = req.body;
  const result = await query(
    'UPDATE publications SET title = $1, authors = $2, venue = $3, pdf_url = $4, background_color = $5 WHERE id = $6 RETURNING id, title, authors, venue, pdf_url, background_color',
    [title, authors, venue, pdf_url || null, backgroundColor || '#FFFFFF', req.params.id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Publication introuvable' });
  }

  await trackUpdate(`Publication mise a jour: ${title}`);
  return res.json(result.rows[0]);
});

router.delete('/publications/:id', requireRole('admin'), async (req, res) => {
  const result = await query('DELETE FROM publications WHERE id = $1 RETURNING id', [req.params.id]);

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Publication introuvable' });
  }

  return res.status(204).send();
});

router.get('/events', requireRole('admin', 'researcher'), async (_req, res) => {
  const result = await query('SELECT id, title, description, date::text, location FROM events ORDER BY date ASC');
  res.json({ items: result.rows });
});

router.post('/events', requireRole('admin'), async (req, res) => {
  const { title, description, date, location } = req.body;

  if (!title || !description || !date || !location) {
    return res.status(400).json({ message: 'Tous les champs evenement sont requis' });
  }

  try {
    const result = await query(
      'INSERT INTO events (title, description, date, location) VALUES ($1, $2, $3, $4) RETURNING id, title, description, date::text, location',
      [title, description, date, location]
    );

    await trackUpdate(`Nouvel Evenement: ${title}`);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating event:', err);
    return res.status(500).json({ message: 'Erreur lors de la création de l\'événement: ' + err.message });
  }
});

router.put('/events/:id', requireRole('admin'), async (req, res) => {
  const { title, description, date, location } = req.body;
  try {
    const result = await query(
      'UPDATE events SET title = $1, description = $2, date = $3, location = $4 WHERE id = $5 RETURNING id, title, description, date::text, location',
      [title, description, date, location, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Evenement introuvable' });
    }

    await trackUpdate(`Evenement mis a jour: ${title}`);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating event:', err);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour: ' + err.message });
  }
});

router.delete('/events/:id', requireRole('admin'), async (req, res) => {
  const result = await query('DELETE FROM events WHERE id = $1 RETURNING id', [req.params.id]);

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Evenement introuvable' });
  }

  return res.status(204).send();
});

// Session Management
router.get('/events/:eventId/sessions', requireRole('admin', 'researcher'), async (req, res) => {
  const result = await query('SELECT id, event_id, title, description, speaker_name, start_time::text, end_time::text, day FROM event_sessions WHERE event_id = $1 ORDER BY day ASC, start_time ASC', [req.params.eventId]);
  res.json(result.rows);
});

router.post('/events/:eventId/sessions', requireRole('admin'), async (req, res) => {
  try {
    const { title, description, speaker_name, start_time, end_time, day } = req.body;
    if (!title || !start_time || !end_time || !day) {
      return res.status(400).json({ message: 'Titre, debut, fin et jour sont requis' });
    }
    const result = await query(
      'INSERT INTO event_sessions (event_id, title, description, speaker_name, start_time, end_time, day) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, event_id, title, description, speaker_name, start_time::text, end_time::text, day',
      [req.params.eventId, title, description, speaker_name, start_time, end_time, day]
    );
    await trackUpdate(`La session '${title}' a ete ajoutee`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ message: 'Erreur lors de la création de la session: ' + error.message });
  }
});

router.put('/events/sessions/:id', requireRole('admin'), async (req, res) => {
  try {
    const { title, description, speaker_name, start_time, end_time, day } = req.body;
    const result = await query(
      'UPDATE event_sessions SET title = $1, description = $2, speaker_name = $3, start_time = $4, end_time = $5, day = $6 WHERE id = $7 RETURNING id, event_id, title, description, speaker_name, start_time::text, end_time::text, day',
      [title, description, speaker_name, start_time, end_time, day, req.params.id]
    );
    await trackUpdate(`La session '${title}' a ete mise a jour`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour: ' + error.message });
  }
});

router.delete('/events/sessions/:id', requireRole('admin'), async (req, res) => {
  await query('DELETE FROM event_sessions WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

router.get('/home-content', requireRole('admin', 'researcher'), async (_req, res) => {
  const result = await query(
    'SELECT id, hero_badge, hero_title, hero_description, updated_at::text FROM home_content ORDER BY updated_at DESC LIMIT 1'
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Contenu accueil introuvable' });
  }

  return res.json(result.rows[0]);
});

router.put('/home-content', requireRole('admin'), async (req, res) => {
  const { hero_badge, hero_title, hero_description } = req.body;

  if (!hero_badge || !hero_title || !hero_description) {
    return res.status(400).json({ message: 'Tous les champs accueil sont requis' });
  }

  const existing = await query('SELECT id FROM home_content ORDER BY updated_at DESC LIMIT 1');

  if (!existing.rows[0]) {
    const created = await query(
      'INSERT INTO home_content (hero_badge, hero_title, hero_description, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id, hero_badge, hero_title, hero_description, updated_at::text',
      [hero_badge, hero_title, hero_description]
    );
    return res.json(created.rows[0]);
  }

  const updated = await query(
    'UPDATE home_content SET hero_badge = $1, hero_title = $2, hero_description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, hero_badge, hero_title, hero_description, updated_at::text',
    [hero_badge, hero_title, hero_description, existing.rows[0].id]
  );

  return res.json(updated.rows[0]);
});

export default router;
