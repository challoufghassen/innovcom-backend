import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const avatarsDir = path.resolve(process.cwd(), 'uploads/avatars');
const uploadsDir = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.sub}-${Date.now()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont autorises'));
    }
  }
});

const router = Router();

router.use(authenticateToken);

// Upload PDF for publication with error handling
router.post('/publications/upload', (req, res, next) => {
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

// Create a new project for the authenticated user
router.post('/projects', async (req, res) => {
  const { title, team, partners, details, results, backgroundColor } = req.body;
  const userId = req.user.sub;

  if (!title) {
    return res.status(400).json({ message: 'Le titre est requis' });
  }

  try {
    const desc = title + '...';
    const result = await query(
      'INSERT INTO projects (title, description, technologies, status, team, partners, details, results, user_id, background_color) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, title, team, partners, details, results, background_color',
      [title, desc, 'N/A', 'Publié', team || '', partners || '', details || '', results || '', userId, backgroundColor || '#FFFFFF']
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user project:', error);
    return res.status(500).json({ message: 'Erreur lors de la création du projet (v3): ' + error.message });
  }
});

// List projects created by the authenticated user
router.get('/projects', async (req, res) => {
  const userId = req.user.sub;

  try {
    const result = await query(
      'SELECT id, title, team, partners, details, results, background_color FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des projets' });
  }
});

// Update a project created by the authenticated user
router.put('/projects/:id', async (req, res) => {
  const { title, team, partners, details, results, backgroundColor } = req.body;
  const userId = req.user.sub;
  const { id } = req.params;

  try {
    const result = await query(
      'UPDATE projects SET title = $1, team = $2, partners = $3, details = $4, results = $5, background_color = $6 WHERE id = $7 AND user_id = $8 RETURNING id, title, team, partners, details, results, background_color',
      [title, team, partners, details, results, backgroundColor || '#FFFFFF', id, userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Projet introuvable ou non autorisé' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user project:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du projet' });
  }
});

// Delete a project created by the authenticated user
router.delete('/projects/:id', async (req, res) => {
  const userId = req.user.sub;
  const { id } = req.params;

  try {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Projet introuvable ou non autorisé' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting user project:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression du projet' });
  }
});

// Create a new publication for the authenticated user
router.post('/publications', async (req, res) => {
  const { title, authors, venue, pdfUrl, backgroundColor } = req.body;
  const userId = req.user.sub;

  if (!title || !authors || !venue) {
    return res.status(400).json({ message: 'Titre, auteurs et lieu sont requis' });
  }

  try {
    const result = await query(
      'INSERT INTO publications (title, authors, venue, pdf_url, user_id, background_color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, authors, venue, pdf_url, background_color',
      [title, authors, venue, req.body.pdf_url || req.body.pdfUrl || '', userId, backgroundColor || '#FFFFFF']
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user publication:', error);
    return res.status(500).json({ message: 'Erreur lors de la création de la publication' });
  }
});

// List publications created by the authenticated user
router.get('/publications', async (req, res) => {
  const userId = req.user.sub;

  try {
    const result = await query(
      'SELECT id, title, authors, venue, pdf_url, background_color, EXTRACT(YEAR FROM created_at)::text AS year FROM publications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching user publications:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des publications' });
  }
});

// Update a publication created by the authenticated user
router.put('/publications/:id', async (req, res) => {
  const { title, authors, venue, backgroundColor } = req.body;
  const pdf_url = req.body.pdf_url || req.body.pdfUrl;
  const userId = req.user.sub;
  const { id } = req.params;

  try {
    const result = await query(
      'UPDATE publications SET title = $1, authors = $2, venue = $3, pdf_url = $4, background_color = $5 WHERE id = $6 AND user_id = $7 RETURNING id, title, authors, venue, pdf_url, background_color',
      [title, authors, venue, pdf_url, backgroundColor || '#FFFFFF', id, userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Publication introuvable ou non autorisée' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user publication:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour de la publication' });
  }
});

// Delete a publication created by the authenticated user
router.delete('/publications/:id', async (req, res) => {
  const userId = req.user.sub;
  const { id } = req.params;

  try {
    const result = await query(
      'DELETE FROM publications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Publication introuvable ou non autorisée' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting user publication:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression de la publication' });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
  const userId = req.user.sub;
  try {
    const result = await query(
      'SELECT id, full_name, email, role, speciality, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération du profil' });
  }
});

// Upload profile picture
router.post('/profile/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier téléchargé' });
  }

  const userId = req.user.sub;
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  try {
    await query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, userId]
    );

    // Notify connected devices (like mobile) via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('profile_updated', { avatarUrl });
    }

    return res.json({ avatarUrl });
  } catch (error) {
    console.error('Error updating avatar:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'avatar' });
  }
});

export default router;
