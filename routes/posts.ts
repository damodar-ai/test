import { Router } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';

const router = Router();

// Middleware to check if user is a Hotel
const hotelOnlyMiddleware = (req: AuthRequest, res: any, next: any) => {
    console.log('[AUTH] hotelOnlyMiddleware - user:', JSON.stringify(req.user));
    console.log('[AUTH] identityType:', req.user?.identityType);
    if (req.user?.identityType !== 'Hotel') {
        return res.status(403).json({ error: 'Access denied. Hotel users only.' });
    }
    next();
};

// Get all posts (for corporates to browse)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { city, minPrice, maxPrice, page = 1, limit = 50 } = req.query;
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const offset = (pageNum - 1) * limitNum;

        console.log('[POSTS] Fetching all posts for user:', req.user?.email);

        let query = `
            SELECT 
                p.*,
                h.HotelName,
                h.City,
                h.StarCategory,
                h.ContactNumber,
                h.ContactEmail
            FROM HotelPosts p
            JOIN HotelDetails h ON p.HotelDetails_Id = h.Id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (city) {
            query += ' AND h.City LIKE ?';
            params.push(`%${city}%`);
        }
        if (minPrice) {
            query += ' AND p.Price >= ?';
            params.push(parseFloat(minPrice as string));
        }
        if (maxPrice) {
            query += ' AND p.Price <= ?';
            params.push(parseFloat(maxPrice as string));
        }

        query += ` ORDER BY p.CreatedAt DESC LIMIT ${limitNum} OFFSET ${offset}`;

        console.log('[POSTS] Query:', query);
        console.log('[POSTS] Params:', params);

        const posts = await executeQuery(query, params);

        console.log('[POSTS] Found posts:', Array.isArray(posts) ? posts.length : 0);

        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total
            FROM HotelPosts p
            JOIN HotelDetails h ON p.HotelDetails_Id = h.Id
            WHERE 1=1
        `;
        const countParams: any[] = [];
        if (city) {
            countQuery += ' AND h.City LIKE ?';
            countParams.push(`%${city}%`);
        }
        if (minPrice) {
            countQuery += ' AND p.Price >= ?';
            countParams.push(parseFloat(minPrice as string));
        }
        if (maxPrice) {
            countQuery += ' AND p.Price <= ?';
            countParams.push(parseFloat(maxPrice as string));
        }

        const countResult = await executeQuery(countQuery, countParams) as any[];
        const total = countResult[0]?.total || 0;

        console.log('[POSTS] Total count:', total);

        res.json({
            posts,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('[POSTS] Get all posts error:', error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// Get current hotel's posts
router.get('/my', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;

        // First get the hotel details id for this user
        const hotelDetails = await executeQuery(
            'SELECT Id FROM HotelDetails WHERE userId = ?',
            [userId]
        ) as any[];

        if (!hotelDetails.length) {
            return res.status(404).json({ error: 'Hotel profile not found. Please complete your profile first.' });
        }

        const hotelId = hotelDetails[0].Id;

        const posts = await executeQuery(
            `SELECT * FROM HotelPosts WHERE HotelDetails_Id = ? ORDER BY CreatedAt DESC`,
            [hotelId]
        );

        res.json(posts);
    } catch (error) {
        console.error('[POSTS] Get my posts error:', error);
        res.status(500).json({ error: 'Failed to fetch your posts' });
    }
});

// Create new post (Hotel only)
router.post('/', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;
        const { title, description, price, availableDate, minPrice, maxPrice, startDate, endDate } = req.body;

        console.log('[POSTS] Create post request:', { userId, title, price, availableDate });

        // Price OR MinPrice/MaxPrice must be present. For now we mandate Title.
        if (!title) {
            console.warn('[POSTS] Create post failed: Title is required');
            return res.status(400).json({ error: 'Title is required' });
        }

        // Get hotel details id
        const hotelDetails = await executeQuery(
            'SELECT Id FROM HotelDetails WHERE userId = ?',
            [userId]
        ) as any[];

        if (!hotelDetails.length) {
            console.error('[POSTS] Create post failed: Hotel profile not found for user', userId);
            return res.status(404).json({ error: 'Hotel profile not found. Please complete your profile first.' });
        }

        const hotelId = hotelDetails[0].Id;
        console.log('[POSTS] Found hotelId:', hotelId);

        const result = await executeQuery(
            `INSERT INTO HotelPosts (HotelDetails_Id, Title, Description, Price, MinPrice, MaxPrice, AvailableDate, StartDate, EndDate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                hotelId, title, description || '',
                price ? parseFloat(price) : null,
                minPrice ? parseFloat(minPrice) : null,
                maxPrice ? parseFloat(maxPrice) : null,
                availableDate || null,
                startDate || null,
                endDate || null
            ]
        ) as any;

        console.log('[POSTS] Post created successfully, Id:', result.insertId);

        res.status(201).json({
            message: 'Post created successfully',
            postId: result.insertId
        });
    } catch (error) {
        console.error('[POSTS] Create post error:', error);
        res.status(500).json({ error: 'Failed to create post. Check server logs.' });
    }
});

// Update post (Hotel only)
router.put('/:id', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;
        const postId = req.params.id;
        const { title, description, price, availableDate, minPrice, maxPrice, startDate, endDate } = req.body;

        // Get hotel details id
        const hotelDetails = await executeQuery(
            'SELECT Id FROM HotelDetails WHERE userId = ?',
            [userId]
        ) as any[];

        if (!hotelDetails.length) {
            return res.status(404).json({ error: 'Hotel profile not found' });
        }

        const hotelId = hotelDetails[0].Id;

        // Verify ownership
        const existingPost = await executeQuery(
            'SELECT Id FROM HotelPosts WHERE Id = ? AND HotelDetails_Id = ?',
            [postId, hotelId]
        ) as any[];

        if (!existingPost.length) {
            return res.status(404).json({ error: 'Post not found or unauthorized' });
        }

        await executeQuery(
            `UPDATE HotelPosts 
             SET Title = ?, Description = ?, Price = ?, MinPrice = ?, MaxPrice = ?, AvailableDate = ?, StartDate = ?, EndDate = ?
             WHERE Id = ?`,
            [
                title, description || '',
                price ? parseFloat(price) : null,
                minPrice ? parseFloat(minPrice) : null,
                maxPrice ? parseFloat(maxPrice) : null,
                availableDate || null,
                startDate || null,
                endDate || null,
                postId
            ]
        );

        res.json({ message: 'Post updated successfully' });
    } catch (error) {
        console.error('[POSTS] Update post error:', error);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

// Delete post (Hotel only)
router.delete('/:id', authMiddleware, hotelOnlyMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.id;
        const postId = req.params.id;

        // Get hotel details id
        const hotelDetails = await executeQuery(
            'SELECT Id FROM HotelDetails WHERE userId = ?',
            [userId]
        ) as any[];

        if (!hotelDetails.length) {
            return res.status(404).json({ error: 'Hotel profile not found' });
        }

        const hotelId = hotelDetails[0].Id;

        // Verify ownership and delete
        const result = await executeQuery(
            'DELETE FROM HotelPosts WHERE Id = ? AND HotelDetails_Id = ?',
            [postId, hotelId]
        ) as any;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Post not found or unauthorized' });
        }

        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        console.error('[POSTS] Delete post error:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

export default router;
