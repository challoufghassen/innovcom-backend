import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

import { io } from '../server.js';

const router = Router();

router.use(authenticateToken);

// Send a private message
router.post('/', async (req, res) => {
  const { receiverId, content } = req.body;
  const senderId = req.user.sub;

  if (!receiverId || !content) {
    return res.status(400).json({ message: 'Destinataire et contenu requis' });
  }

  try {
    const result = await query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [senderId, receiverId, content]
    );

    const newMessage = result.rows[0];

    // Emit real-time notification via Socket.io
    const sender = await query('SELECT full_name, avatar_url FROM users WHERE id = $1', [senderId]);
    const messageData = {
      ...newMessage,
      sender_name: sender.rows[0]?.full_name || 'Utilisateur',
      sender_avatar: sender.rows[0]?.avatar_url
    };

    io.to(`user_${receiverId}`).to(`user_${senderId}`).emit('new_message', messageData);

    return res.status(201).json(messageData);
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ message: 'Erreur lors de l\'envoi du message' });
  }
});

// Get received messages
router.get('/received', async (req, res) => {
  const userId = req.user.sub;

  try {
    const result = await query(
      `
      SELECT m.*, u.full_name as sender_full_name, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.receiver_id = $1
      ORDER BY m.created_at DESC
      `,
      [userId]
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des messages' });
  }
});

// Mark message as read
router.patch('/:id/read', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.sub;

  try {
    await query(
      'UPDATE messages SET is_read = TRUE WHERE id = $1 AND receiver_id = $2',
      [id, userId]
    );
    return res.status(204).send();
  } catch (error) {
    console.error('Error marking message as read:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du message' });
  }
});

// Get conversation list (latest message per contact)
router.get('/conversations', async (req, res) => {
  const userId = req.user.sub;
  try {
    const result = await query(
      `
      WITH LastMessages AS (
        SELECT 
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END as contact_id,
          MAX(created_at) as last_message_time
        FROM messages
        WHERE sender_id = $1 OR receiver_id = $1
        GROUP BY contact_id
      )
      SELECT 
        lm.contact_id as id, 
        u.full_name as full_name, 
        u.avatar_url as avatar_url,
        m.content as last_message,
        m.created_at,
        m.sender_id,
        (SELECT COUNT(*)::int FROM messages WHERE receiver_id = $1 AND sender_id = lm.contact_id AND is_read = FALSE) as unread_count
      FROM LastMessages lm
      JOIN users u ON lm.contact_id = u.id
      JOIN messages m ON lm.last_message_time = m.created_at 
        AND ((m.sender_id = $1 AND m.receiver_id = lm.contact_id) OR (m.sender_id = lm.contact_id AND m.receiver_id = $1))
      ORDER BY m.created_at DESC
      `,
      [userId]
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des conversations' });
  }
});

// Get full conversation history with a user
router.get('/conversation/:userId', async (req, res) => {
  const currentUserId = req.user.sub;
  const otherUserId = req.params.userId;
  try {
    const result = await query(
      `
      SELECT m.*, u.full_name as sender_full_name, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
      `,
      [currentUserId, otherUserId]
    );
    
    // Mark messages as read
    await query(
      'UPDATE messages SET is_read = TRUE WHERE receiver_id = $1 AND sender_id = $2',
      [currentUserId, otherUserId]
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération de la conversation' });
  }
});

// Delete conversation
router.delete('/conversation/:userId', async (req, res) => {
  const currentUserId = req.user.sub;
  const otherUserId = req.params.userId;
  try {
    await query(
      `
      DELETE FROM messages
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      `,
      [currentUserId, otherUserId]
    );
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression de la conversation' });
  }
});

// Delete a single message
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.sub;
  try {
    const result = await query(
      'DELETE FROM messages WHERE id = $1 AND (sender_id = $2 OR receiver_id = $2) RETURNING id',
      [id, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Message non trouvé' });
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression du message' });
  }
});

// Admin: Get all conversations in the system
router.get('/admin/all-conversations', requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      `
      WITH PairMessages AS (
        SELECT 
          LEAST(sender_id, receiver_id) as user1,
          GREATEST(sender_id, receiver_id) as user2,
          MAX(created_at) as last_message_time
        FROM messages
        GROUP BY user1, user2
      )
      SELECT 
        pm.user1,
        pm.user2,
        u1.full_name as user1_name,
        u2.full_name as user2_name,
        u1.avatar_url as user1_avatar,
        u2.avatar_url as user2_avatar,
        m.content as last_message,
        m.created_at
      FROM PairMessages pm
      JOIN users u1 ON pm.user1 = u1.id
      JOIN users u2 ON pm.user2 = u2.id
      JOIN messages m ON pm.last_message_time = m.created_at
        AND ((m.sender_id = pm.user1 AND m.receiver_id = pm.user2) OR (m.sender_id = pm.user2 AND m.receiver_id = pm.user1))
      ORDER BY m.created_at DESC
      `
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching all conversations:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des conversations globales' });
  }
});

// Admin: Get history between any two users
router.get('/admin/conversation/:user1/:user2', requireRole('admin'), async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const result = await query(
      `
      SELECT m.*, u.full_name as sender_full_name, u.avatar_url as sender_avatar_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
      `,
      [user1, user2]
    );
    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching global conversation:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique global' });
  }
});

export default router;
