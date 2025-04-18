import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs-extra';
import { Database as SQLite3 } from 'sqlite3';

async function setupExecutableDatabase() {
    const dbPath = path.join(process.cwd(), 'database', 'data.db');
    
    try {
        // Remove o arquivo se existir
        if (fs.existsSync(dbPath)) {
            console.log('🗑️ Removendo banco de dados existente...');
            fs.unlinkSync(dbPath);
        }

        // Garante que o diretório existe
        console.log('📁 Criando diretório do banco de dados...');
        await fs.ensureDir(path.dirname(dbPath));

        // Inicializa o SQLite diretamente primeiro
        const db = new SQLite3(dbPath);
        await new Promise((resolve, reject) => {
            db.exec('PRAGMA journal_mode = WAL;', (err: any) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
        db.close();

        // Agora inicializa o Prisma
        const prisma = new PrismaClient({
            datasources: {
                db: {
                    url: `file:${dbPath}`
                }
            },
            errorFormat: 'minimal'
        });

        try {
            console.log('🔄 Inicializando banco de dados...');
            
            // Cria a tabela Player
            await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS Player (
                    id INTEGER PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    level INTEGER NOT NULL,
                    vocation INTEGER NOT NULL,
                    isAlly BOOLEAN NOT NULL
                )
            `;

            console.log('✅ Banco de dados configurado com sucesso!');
        } finally {
            await prisma.$disconnect();
        }
    } catch (error) {
        console.error('❌ Erro ao configurar banco de dados:', error);
        console.error(error);
        throw error;
    }
}

export { setupExecutableDatabase };