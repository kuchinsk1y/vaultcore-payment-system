import path from 'node:path';
import dotenv from 'dotenv';

// The .env file lives at the repository root, regardless of which workspace the process starts from.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
