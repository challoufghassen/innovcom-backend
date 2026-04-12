import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { fullName, email, password, speciality = 'IA' } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Nom, email et mot de passe requis' });
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    return res.status(409).json({ message: 'Ce compte existe deja' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    `
    INSERT INTO users (full_name, email, password_hash, role, is_approved, speciality)
    VALUES ($1, $2, $3, 'researcher', FALSE, $4)
    RETURNING id, full_name, email, role, is_approved, speciality
    `,
    [fullName.trim(), email.trim().toLowerCase(), passwordHash, speciality]
  );

  return res.status(201).json({
    message: 'Compte cree. En attente de validation par un administrateur.',
    user: result.rows[0],
    pendingApproval: true
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }

  const result = await query(
    'SELECT id, full_name, email, role, password_hash, is_approved FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ message: 'Identifiants invalides' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Identifiants invalides' });
  }

  if (!user.is_approved) {
    return res.status(403).json({ message: 'Compte en attente de validation par un administrateur' });
  }

  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });

  return res.json({
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    }
  });
});

export default router;
