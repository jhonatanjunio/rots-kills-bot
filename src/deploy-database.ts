import fs from 'fs-extra';
import path from 'path';
import puppeteer from 'puppeteer';

async function copyChromium() {
    try {
        // Obtém o caminho do executável do Chromium
        const executablePath = puppeteer.executablePath();
        const chromiumPath = path.join('executable', '.local-chromium');
        
        console.log('📂 Copiando Chromium de:', executablePath);
        console.log('📂 Para:', chromiumPath);
        
        // Cria diretório para o Chromium
        await fs.ensureDir(chromiumPath);

        // Copia os arquivos do Chromium
        await fs.copy(
            path.dirname(executablePath),
            chromiumPath,
            { overwrite: true }
        );

        console.log('✅ Chromium copiado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao copiar Chromium:', error);
        throw error;
    }
}

// Lista de diretórios que precisam ser copiados
const assetDirectories = [
    {
        src: 'assets',
        dest: 'executable/assets'
    },
    {
        src: 'database',
        dest: 'executable/database',
        defaultFiles: [
            {
                name: 'data.json',
                content: { players: [] }
            },
            {
                name: 'playerDeaths.json',
                content: { playerDeathLogs: [] }
            },
            {
                name: 'monsterDeaths.json',
                content: { monsterDeathLogs: [] }
            },
            {
                name: 'data.db',
                content: '' // SQLite será inicializado pelo Prisma
            }
        ]
    },
    {
        src: 'prisma',
        dest: 'executable/prisma',
        required: ['schema.prisma']
    }
];

async function copyAssets() {
    for (const dir of assetDirectories) {
        // Garante que o diretório de destino existe
        await fs.ensureDir(dir.dest);

        if (dir.defaultFiles) {
            // Se tem arquivos padrão, cria eles
            for (const file of dir.defaultFiles) {
                const filePath = path.join(dir.dest, file.name);
                await fs.writeJSON(filePath, file.content, { spaces: 2 });
            }
        } else {
            // Se não, copia o diretório inteiro
            await fs.copy(dir.src, dir.dest, {
                overwrite: true,
                errorOnExist: false
            });
        }
    }

    await copyChromium();

    console.log('✅ Assets copiados com sucesso!');
}

async function copyEnvironmentFiles() {
    const envPath = path.join(process.cwd(), '.env');
    const executableEnvPath = path.join('executable', '.env');

    try {
        if (await fs.pathExists(envPath)) {
            await fs.copy(envPath, executableEnvPath);
            console.log('✅ Arquivo .env copiado com sucesso!');
        }
    } catch (error) {
        console.error('❌ Erro ao copiar arquivo .env:', error);
        throw error;
    }
}

async function copyPrismaFiles() {
    try {
        // Copia o schema do Prisma
        await fs.copy(
            path.join(process.cwd(), 'prisma'),
            path.join('executable', 'prisma'),
            {
                filter: (src) => {
                    return src.endsWith('schema.prisma');
                }
            }
        );

        // Copia o engine do Prisma
        const enginePath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
        const executableEnginePath = path.join('executable', 'node_modules', '.prisma', 'client');
        
        await fs.ensureDir(executableEnginePath);
        await fs.copy(enginePath, executableEnginePath);

        console.log('✅ Arquivos do Prisma copiados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao copiar arquivos do Prisma:', error);
        throw error;
    }
}

async function main() {
    await copyAssets();
    await copyEnvironmentFiles();
    await copyPrismaFiles();
    
    // Executa o prisma generate para o executável
    const { execSync } = require('child_process');
    execSync('npx prisma generate --schema=./executable/prisma/schema.prisma');
}

main().catch(console.error);