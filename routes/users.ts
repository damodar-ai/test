import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';
import { generateToken } from '../utils/helpers.ts';

const router = Router();

router.post('/set-identity', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { identityType } = req.body;
        const userId = req.user?.id;
        const userEmail = req.user?.email;
        const userRole = req.user?.role;

        if (!identityType || !['Hotel', 'Corporate'].includes(identityType)) {
            return res.status(400).json({ error: 'Invalid identity type' });
        }

        await executeQuery(
            'UPDATE users SET identityType = ? WHERE id = ?',
            [identityType, userId]
        );

        // Generate new token with updated identityType
        const newToken = generateToken({
            id: userId!,
            email: userEmail!,
            role: userRole!,
            identityType: identityType as 'Hotel' | 'Corporate'
        });

        res.json({
            message: 'Identity type updated successfully',
            identityType,
            token: newToken  // Return new token so frontend can update it
        });
    } catch (error) {
        console.error('Set identity error:', error);
        res.status(500).json({ error: 'Failed to update identity' });
    }
});

export default router;

