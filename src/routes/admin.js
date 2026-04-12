import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

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

router.get('/dashboard', requireRole('admin', 'researcher'), async (_req, res) => {
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

router.patch('/users/:id/approve', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role = 'researcher', speciality } = req.body;

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

router.get('/projects', requireRole('admin', 'researcher'), async (_req, res) => {
  const result = await query('SELECT id, title, description, technologies, status FROM projects ORDER BY created_at DESC');
  res.json({ items: result.rows });
});

router.post('/projects', requireRole('admin'), async (req, res) => {
  const { title, description, technologies, status } = req.body;

  if (!title || !description || !technologies || !status) {
    return res.status(400).json({ message: 'Tous les champs projet sont requis' });
  }

  const result = await query(
    'INSERT INTO projects (title, description, technologies, status) VALUES ($1, $2, $3, $4) RETURNING id, title, description, technologies, status',
    [title, description, technologies, status]
  );

  return res.status(201).json(result.rows[0]);
});

router.put('/projects/:id', requireRole('admin'), async (req, res) => {
  const { title, description, technologies, status } = req.body;
  const { id } = req.params;

  const result = await query(
    'UPDATE projects SET title = $1, description = $2, technologies = $3, status = $4 WHERE id = $5 RETURNING id, title, description, technologies, status',
    [title, description, technologies, status, id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Projet introuvable' });
  }

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

router.post('/publications/upload', requireRole('admin'), uploadPdf.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier PDF recu' });
  }

  return res.status(201).json({
    fileName: req.file.filename,
    pdf_url: `/uploads/${req.file.filename}`
  });
});

router.get('/publications', requireRole('admin', 'researcher'), async (_req, res) => {
  const result = await query('SELECT id, title, authors, venue, pdf_url FROM publications ORDER BY created_at DESC');
  res.json({ items: result.rows });
});

router.post('/publications', requireRole('admin'), async (req, res) => {
  const { title, authors, venue, pdf_url } = req.body;

  if (!title || !authors || !venue) {
    return res.status(400).json({ message: 'Les champs titre, auteurs et revue sont requis' });
  }

  const result = await query(
    'INSERT INTO publications (title, authors, venue, pdf_url) VALUES ($1, $2, $3, $4) RETURNING id, title, authors, venue, pdf_url',
    [title, authors, venue, pdf_url || null]
  );

  return res.status(201).json(result.rows[0]);
});

router.put('/publications/:id', requireRole('admin'), async (req, res) => {
  const { title, authors, venue, pdf_url } = req.body;
  const result = await query(
    'UPDATE publications SET title = $1, authors = $2, venue = $3, pdf_url = $4 WHERE id = $5 RETURNING id, title, authors, venue, pdf_url',
    [title, authors, venue, pdf_url || null, req.params.id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Publication introuvable' });
  }

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

  const result = await query(
    'INSERT INTO events (title, description, date, location) VALUES ($1, $2, $3, $4) RETURNING id, title, description, date::text, location',
    [title, description, date, location]
  );

  return res.status(201).json(result.rows[0]);
});

router.put('/events/:id', requireRole('admin'), async (req, res) => {
  const { title, description, date, location } = req.body;
  const result = await query(
    'UPDATE events SET title = $1, description = $2, date = $3, location = $4 WHERE id = $5 RETURNING id, title, description, date::text, location',
    [title, description, date, location, req.params.id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Evenement introuvable' });
  }

  return res.json(result.rows[0]);
});

router.delete('/events/:id', requireRole('admin'), async (req, res) => {
  const result = await query('DELETE FROM events WHERE id = $1 RETURNING id', [req.params.id]);

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'Evenement introuvable' });
  }

  return res.status(204).send();
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
