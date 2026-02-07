import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool: mysql.Pool;

export const initializeDatabase = async () => {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'corp_hotel_booking',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const connection = await pool.getConnection();
    console.log('Connected to MySQL database');

    // Auto-migration: Check/Add HotelPosts_Id column to Chat table
    try {
      await connection.execute(`
        SELECT HotelPosts_Id FROM Chat LIMIT 1
      `);
    } catch (err: any) {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        console.log('Migrating: Adding HotelPosts_Id column to Chat table...');
        await connection.execute(`
           ALTER TABLE Chat 
           ADD COLUMN HotelPosts_Id BIGINT AFTER HotelDetails_Id,
           ADD CONSTRAINT fk_chat_post FOREIGN KEY (HotelPosts_Id) REFERENCES HotelPosts(Id) ON DELETE SET NULL
         `);
        console.log('Migration successful: HotelPosts_Id column added.');
      }
    }

    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

export const getPool = () => {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export const executeQuery = async (query: string, values?: any[]) => {
  const connection = await getPool().getConnection();
  try {
    const [results] = await connection.execute(query, values);
    return results;
  } finally {
    connection.release();
  }
};

export const executeQueryWithConnection = async (callback: (connection: mysql.Connection) => Promise<any>) => {
  const connection = await getPool().getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
};
