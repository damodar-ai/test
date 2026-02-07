import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const resetDatabase = async () => {
    let connection;
    try {
        console.log('Reading schema.sql...');
        const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('Connecting to MySQL...');
        // Connect without database selected initially to allow DROP/CREATE DATABASE
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        });

        console.log('Executing schema...');

        // Disable FK checks explicitly
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        console.log('Dropping database...');
        await connection.query('DROP DATABASE IF EXISTS corp_hotel_booking');

        console.log('Executing schema...');
        await connection.query(schema);

        // Re-enable FK checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('✓ Database reset successfully');
        process.exit(0);
    } catch (error) {
        console.error('✗ Database reset failed:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};

resetDatabase();
