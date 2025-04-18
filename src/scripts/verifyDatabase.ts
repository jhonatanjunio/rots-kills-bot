import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs-extra';
import { setupExecutableDatabase } from './setupExecutableDatabase';

async function verifyDatabase() {
    const dbPath = path.join(process.cwd(), 'database', 'data.db');
    
    try {
        if (!fs.existsSync(dbPath)) {
            console.log('🔄 Banco de dados não encontrado, criando...');
            await setupExecutableDatabase();
            return;
        }

        const prisma = new PrismaClient({
            datasources: {
                db: {
                    url: `file:${dbPath}`
                }
            }
        });

        try {
            // Tenta executar uma query simples
            await prisma.$queryRaw`SELECT 1`;
            console.log('✅ Banco de dados verificado com sucesso!');
        } catch (error) {
            console.log('❌ Banco de dados corrompido, recriando...');
            await prisma.$disconnect();
            await setupExecutableDatabase();
        } finally {
            await prisma.$disconnect();
        }
    } catch (error) {
        console.error('Erro durante verificação do banco:', error);
        throw error;
    }
}

verifyDatabase().catch(console.error); 