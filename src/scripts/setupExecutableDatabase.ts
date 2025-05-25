import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs-extra';
import { Database as SQLite3 } from 'sqlite3';

async function setupExecutableDatabase() {
    const dbPath = path.join(process.cwd(), 'database', 'data.db');
    const dataJsonPath = path.join(process.cwd(), 'database', 'data.json');
    
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

            // Importa dados do data.json se existir
            if (await fs.pathExists(dataJsonPath)) {
                console.log('📥 Importando dados do data.json...');
                const jsonData = await fs.readJSON(dataJsonPath);
                
                if (jsonData.players && jsonData.players.length > 0) {
                    console.log(`Encontrados ${jsonData.players.length} jogadores para importar`);
                    
                    // Importa os jogadores
                    await prisma.player.createMany({
                        data: jsonData.players.map((player: any) => ({
                            id: player.id,
                            name: player.name,
                            level: player.level,
                            vocation: player.vocation,
                            isAlly: player.isAlly
                        }))
                    });
                    
                    console.log('✅ Dados importados com sucesso!');
                } else {
                    console.log('⚠️ Arquivo data.json está vazio');
                }
            } else {
                console.log('⚠️ Arquivo data.json não encontrado');
            }

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