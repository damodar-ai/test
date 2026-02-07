
import { Router } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';
import { getCorporateDetailsId, getHotelDetailsId } from '../utils/helpers.ts';

const router = Router();

// Send a message
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { recipientId, message, postId } = req.body;

        if (!recipientId || !message) {
            return res.status(400).json({ error: 'Recipient and message are required' });
        }

        let corpId, hotelId, senderType;

        if (req.user?.identityType === 'Corporate') {
            corpId = await getCorporateDetailsId(req.user.id);
            hotelId = recipientId;
            senderType = 'Corporate';
        } else if (req.user?.identityType === 'Hotel') {
            hotelId = await getHotelDetailsId(req.user.id);
            corpId = recipientId;
            senderType = 'Hotel';
        } else {
            return res.status(403).json({ error: 'Invalid user type for chat' });
        }

        if (!corpId || !hotelId) {
            return res.status(404).json({ error: 'Sender or recipient profile not found' });
        }

        await executeQuery(
            `INSERT INTO Chat (CorporateDetails_Id, HotelDetails_Id, HotelPosts_Id, Message, SenderType)
             VALUES (?, ?, ?, ?, ?)`,
            [corpId, hotelId, postId || null, message, senderType]
        );

        res.status(201).json({ message: 'Message sent' });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get chat history with a specific partner
router.get('/history/:partnerId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const partnerId = req.params.partnerId;
        const { postId } = req.query; // Optional: Filter by post

        let corpId, hotelId;

        if (req.user?.identityType === 'Corporate') {
            corpId = await getCorporateDetailsId(req.user.id);
            hotelId = partnerId;
        } else if (req.user?.identityType === 'Hotel') {
            hotelId = await getHotelDetailsId(req.user.id);
            corpId = partnerId;
        } else {
            return res.status(403).json({ error: 'Invalid user type' });
        }

        let query = `
            SELECT * FROM Chat 
            WHERE CorporateDetails_Id = ? AND HotelDetails_Id = ?
        `;
        const params: any[] = [corpId, hotelId];

        if (postId) {
            query += ` AND HotelPosts_Id = ?`;
            params.push(postId);
        }

        query += ` ORDER BY CreatedAt ASC`;

        const messages = await executeQuery(query, params);
        res.json(messages);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Get inbox (conversations)
router.get('/inbox', authMiddleware, async (req: AuthRequest, res) => {
    try {
        let query = '';
        let params: any[] = [];

        if (req.user?.identityType === 'Corporate') {
            const corpId = await getCorporateDetailsId(req.user.id);
            query = `
                SELECT 
                    h.Id, 
                    h.HotelName as Name, 
                    h.City,
                    c.HotelPosts_Id,
                    MAX(c.CreatedAt) as LastMessageTime
                FROM Chat c
                JOIN HotelDetails h ON c.HotelDetails_Id = h.Id
                WHERE c.CorporateDetails_Id = ?
                GROUP BY h.Id, h.HotelName, h.City, c.HotelPosts_Id
                ORDER BY LastMessageTime DESC
            `;
            params = [corpId];
        } else if (req.user?.identityType === 'Hotel') {
            const hotelId = await getHotelDetailsId(req.user.id);
            query = `
                SELECT 
                    cd.Id, 
                    cd.CompanyName as Name, 
                    cd.IndustryType,
                    c.HotelPosts_Id,
                    MAX(c.CreatedAt) as LastMessageTime
                FROM Chat c
                JOIN CorporateDetails cd ON c.CorporateDetails_Id = cd.Id
                WHERE c.HotelDetails_Id = ?
                GROUP BY cd.Id, cd.CompanyName, cd.IndustryType, c.HotelPosts_Id
                ORDER BY LastMessageTime DESC
            `;
            params = [hotelId];
        }

        const conversations = await executeQuery(query, params);
        res.json(conversations);
    } catch (error) {
        console.error('Get inbox error:', error);
        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
});

// Get conversations for a specific post (Hotel View)
router.get('/post/:postId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const postId = req.params.postId;
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const hotelId = await getHotelDetailsId(req.user.id);

        if (!hotelId) return res.status(404).json({ error: 'Hotel not found' });

        // Verify post belongs to hotel
        const postCheck = await executeQuery('SELECT Id FROM HotelPosts WHERE Id = ? AND HotelDetails_Id = ?', [postId, hotelId]) as any[];
        if (!postCheck.length) return res.status(403).json({ error: 'Unauthorized' });

        // Get distinct Corporate users who messaged about this post
        // Also fetch the LATEST message for preview
        const query = `
            SELECT 
                cd.Id as CorporateId,
                cd.CompanyName,
                MAX(c.CreatedAt) as LastMessageTime,
                (SELECT Message FROM Chat c2 WHERE c2.CorporateDetails_Id = cd.Id AND c2.HotelPosts_Id = ? ORDER BY c2.CreatedAt DESC LIMIT 1) as LastMessage
            FROM Chat c
            JOIN CorporateDetails cd ON c.CorporateDetails_Id = cd.Id
            WHERE c.HotelPosts_Id = ? AND c.HotelDetails_Id = ?
            GROUP BY cd.Id, cd.CompanyName
            ORDER BY LastMessageTime DESC
        `;

        const conversations = await executeQuery(query, [postId, postId, hotelId]);
        res.json(conversations);

    } catch (error) {
        console.error('Get post chats error:', error);
        res.status(500).json({ error: 'Failed to fetch post chats' });
    }
});

export default router;
