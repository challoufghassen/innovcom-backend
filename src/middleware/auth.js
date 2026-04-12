import jwt from 'jsonwebtoken';
import { query } from '../db.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await query(
      'SELECT id, email, role, is_approved FROM users WHERE id = $1',
      [payload.sub]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Session invalide: utilisateur introuvable' });
    }

    if (!user.is_approved) {
      return res.status(403).json({ message: 'Compte en attente de validation' });
    }

    req.user = {
      sub: user.id,
      email: user.email,
      role: user.role
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Acces refuse' });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Acces refuse' });
    }

    return next();
  };
}
