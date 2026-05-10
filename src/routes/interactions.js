import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { io } from '../server.js';

const router = Router();

// Get detailed reactors for a target
router.get('/:targetType/:targetId/reactors', async (req, res) => {
  const { targetType, targetId } = req.params;
  try {
    const reactors = await query(
      `SELECT r.type, r.created_at, u.id as user_id, u.full_name as user_name, u.avatar_url as user_avatar, u.role as user_role
       FROM reactions r
       JOIN users u ON r.user_id = u.id
       WHERE r.target_type = $1 AND r.target_id = $2
       ORDER BY r.created_at DESC`,
      [targetType, targetId]
    );
    res.json(reactors.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get reactions and comments for a specific item
router.get('/:targetType/:targetId', async (req, res) => {
  const { targetType, targetId } = req.params;
  const currentUserId = req.query.userId; // Optional, to see if current user has reacted

  try {
    const [reactions, comments] = await Promise.all([
      query(
        `SELECT type, COUNT(*) as count 
         FROM reactions 
         WHERE target_type = $1 AND target_id = $2 
         GROUP BY type`,
        [targetType, targetId]
      ),
      query(
        `SELECT c.*, u.full_name as user_name, u.avatar_url as user_avatar
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.target_type = $1 AND c.target_id = $2
         ORDER BY c.created_at ASC`,
        [targetType, targetId]
      )
    ]);

    let userReaction = null;
    if (currentUserId) {
      const userReactResult = await query(
        'SELECT type FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3',
        [targetType, targetId, currentUserId]
      );
      if (userReactResult.rows.length > 0) {
        userReaction = userReactResult.rows[0].type;
      }
    }

    res.json({
      reactions: reactions.rows,
      comments: comments.rows,
      userReaction
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// React to an item
router.post('/react', authenticateToken, async (req, res) => {
  const { targetType, targetId, type } = req.body;
  const userId = req.user.sub;

  try {
    if (!type) {
      // Remove reaction
      await query(
        'DELETE FROM reactions WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
        [userId, targetType, targetId]
      );
      io.emit('interaction_updated', { targetType, targetId });
      return res.json({ message: 'Reaction removed' });
    }

    // Add or update reaction
    await query(
      `INSERT INTO reactions (user_id, target_type, target_id, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, target_type, target_id)
       DO UPDATE SET type = EXCLUDED.type`,
      [userId, targetType, targetId, type]
    );

    io.emit('interaction_updated', { targetType, targetId });

    res.json({ message: 'Reaction saved', type });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Post a comment
router.post('/comment', authenticateToken, async (req, res) => {
  const { targetType, targetId, content } = req.body;
  const userId = req.user.sub;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'Content is required' });
  }

  try {
    const result = await query(
      `INSERT INTO comments (user_id, target_type, target_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, targetType, targetId, content.trim()]
    );

    // Fetch user info for immediate display
    const userResult = await query('SELECT full_name, avatar_url FROM users WHERE id = $1', [userId]);
    const comment = {
      ...result.rows[0],
      user_name: userResult.rows[0].full_name,
      user_avatar: userResult.rows[0].avatar_url
    };

    io.emit('interaction_updated', { targetType, targetId });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a comment
router.delete('/comment/:id', authenticateToken, async (req, res) => {
  const commentId = req.params.id;
  const userId = req.user.sub;
  const userRole = req.user.role;

  try {
    const commentResult = await query('SELECT user_id FROM comments WHERE id = $1', [commentId]);
    if (commentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const comment = commentResult.rows[0];
    if (comment.user_id !== userId && !['admin', 'superadmin'].includes(userRole)) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }
    const { target_type: targetType, target_id: targetId } = (await query('SELECT target_type, target_id FROM comments WHERE id = $1', [commentId])).rows[0];

    await query('DELETE FROM comments WHERE id = $1', [commentId]);
    
    io.emit('interaction_updated', { targetType, targetId });
    
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
