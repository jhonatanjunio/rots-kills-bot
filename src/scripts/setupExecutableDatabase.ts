import { PrismaClient } from '@prisma/client';
import path from 'path';

async function setupExecutableDatabase() {
    const dbPath = path.join(process.cwd(), 'database', 'data.db');
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: `file:${dbPath}`
            }
        },
        errorFormat: 'minimal'
    });

    try {
        // Executa as migrações necessárias
        await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS Player (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            level INTEGER NOT NULL,
            vocation INTEGER NOT NULL,
            isAlly BOOLEAN NOT NULL
        )`;

        console.log('✅ Banco de dados configurado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao configurar banco de dados:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

setupExecutableDatabase().catch(console.error);