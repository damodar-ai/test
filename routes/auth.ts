import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth.ts';
import { executeQuery } from '../database/connection.ts';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/helpers.ts';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

// Input validation rules
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 1 }).withMessage('Password required'),
];

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[a-zA-Z]/).withMessage('Password must contain a letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
];

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
router.post('/login', loginValidation, async (req: AuthRequest, res: Response) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const results = await executeQuery(
      'SELECT id, email, password, role, corporateClientId, identityType, isProfileCompleted FROM users WHERE email = ? AND isActive = TRUE',
      [email]
    ) as any[];

    if (results.length === 0) {
      // Don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = results[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      identityType: user.identityType
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        corporateClientId: user.corporateClientId,
        identityType: user.identityType,
        isProfileCompleted: Boolean(user.isProfileCompleted)
      }
    });
  } catch (error) {
    console.error('Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// User Registration
router.post('/register', registerValidation, async (req: AuthRequest, res: Response) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, phone } = req.body;

    // Check if user exists
    const existing = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    ) as any[];

    if (existing.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Use cost factor of 12 for stronger hashing
    const hashedPassword = await bcrypt.hash(password, 12);

    await executeQuery(
      'INSERT INTO users (email, password, firstName, lastName, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [email, hashedPassword, firstName, lastName, phone || null, 'user']
    );

    const newUser = await executeQuery(
      'SELECT id, email, role, identityType, isProfileCompleted FROM users WHERE email = ?',
      [email]
    ) as any[];

    const token = generateToken({
      id: newUser[0].id,
      email: newUser[0].email,
      role: newUser[0].role,
      identityType: newUser[0].identityType
    });

    res.status(201).json({
      token,
      user: {
        id: newUser[0].id,
        email: newUser[0].email,
        role: newUser[0].role,
        identityType: newUser[0].identityType,
        isProfileCompleted: Boolean(newUser[0].isProfileCompleted)
      }
    });
  } catch (error) {
    console.error('Registration error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const results = await executeQuery(
      'SELECT id, email, firstName, lastName, phone, role, corporateClientId, identityType, isProfileCompleted FROM users WHERE id = ?',
      [req.user?.id]
    ) as any[];

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(results[0]);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Google OAuth: Get authorization URL
router.get('/google/url', (_req: AuthRequest, res) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: 'google-auth',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating Google auth URL');
    res.status(500).json({ error: 'Failed to generate Google auth URL' });
  }
});

// Google OAuth: Handle callback and token exchange
router.post('/google/callback', async (req: AuthRequest, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);

    // Verify ID token and get user info
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const { email, name } = payload;

    // Check if user is an admin based on email
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = adminEmails.includes(email.toLowerCase());
    const assignedRole = isAdmin ? 'admin' : 'user';

    // 1. Initial Check: Try to fetch user
    let userResults = await executeQuery(
      'SELECT id, email, password, role, corporateClientId, identityType, isProfileCompleted FROM users WHERE email = ?',
      [email]
    ) as any[];

    let userId: number;
    let userRole = assignedRole;
    let corporateClientId: number | null = null;
    let identityType: 'Hotel' | 'Corporate' | null = null;
    let isProfileCompleted: boolean = false;

    if (userResults.length === 0) {
      const firstName = name?.split(' ')[0] || 'User';
      const lastName = name?.split(' ').slice(1).join(' ') || '';

      try {
        const result = await executeQuery(
          'INSERT INTO users (email, password, firstName, lastName, role, isGoogleAuth, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [email, null, firstName, lastName, assignedRole, true, true]
        ) as any;

        userId = result.insertId;

        // Fetch newly created user
        const newUser = await executeQuery(
          'SELECT id, email, role, corporateClientId, identityType, isProfileCompleted FROM users WHERE id = ?',
          [userId]
        ) as any[];

        userId = newUser[0].id; // Reassign to be sure
        userRole = newUser[0].role;
        corporateClientId = newUser[0].corporateClientId;
        identityType = newUser[0].identityType;
        isProfileCompleted = Boolean(newUser[0].isProfileCompleted);

      } catch (insertError: any) {
        if (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062) {
          // Race condition: User already exists despite initial check
          const existingUserResults = await executeQuery(
            'SELECT id, email, role, corporateClientId, identityType, isProfileCompleted FROM users WHERE email = ?',
            [email]
          ) as any[];

          if (existingUserResults.length > 0) {
            const exUser = existingUserResults[0];
            userId = exUser.id;
            userRole = exUser.role;
            corporateClientId = exUser.corporateClientId;
            identityType = exUser.identityType;
            isProfileCompleted = Boolean(exUser.isProfileCompleted);
          } else {
            throw new Error('Failed to recover user after duplicate entry error');
          }
        } else {
          throw insertError;
        }
      }
    } else {
      const user = userResults[0];
      userId = user.id;
      corporateClientId = user.corporateClientId;
      identityType = user.identityType;
      isProfileCompleted = Boolean(user.isProfileCompleted);

      // Update role if user is now in admin list but wasn't before
      if (isAdmin && user.role !== 'admin') {
        await executeQuery(
          'UPDATE users SET role = ? WHERE id = ?',
          ['admin', userId]
        );
        userRole = 'admin';
      } else {
        userRole = user.role;
      }
    }

    // Generate JWT token
    const token = generateToken({
      id: userId!,
      email: email,
      role: userRole,
      identityType: identityType
    });

    console.log('[GOOGLE_AUTH] ✅ JWT token generated successfully');

    res.json({
      token,
      user: {
        id: userId!,
        email: email,
        role: userRole,
        corporateClientId: corporateClientId,
        identityType: identityType,
        isProfileCompleted: isProfileCompleted
      }
    });

  } catch (error: any) {
    console.error('Google OAuth callback error');
    res.status(500).json({ error: 'Google authentication failed' });;
  }
});

// Logout endpoint
router.post('/logout', (_req: AuthRequest, res) => {
  try {
    // In JWT-based auth, logout is handled on the client side by removing the token
    // This endpoint can be used for additional cleanup if needed
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
