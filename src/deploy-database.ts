import fs from 'fs-extra';
import path from 'path';
import puppeteer from 'puppeteer';
import { logtail } from './utils/logtail';

async function copyChromium() {
    try {
        // Obtém o caminho do executável do Chromium
        const executablePath = puppeteer.executablePath();
        const chromiumPath = path.join('executable', '.local-chromium');
        
        logtail.info(`Copiando Chromium de: ${executablePath}`);
        logtail.info(`Para: ${chromiumPath}`);
        
        // Cria diretório para o Chromium
        await fs.ensureDir(chromiumPath);

        // Copia os arquivos do Chromium
        await fs.copy(
            path.dirname(executablePath),
            chromiumPath,
            { overwrite: true }
        );

        logtail.info('Chromium copiado com sucesso!');
    } catch (error) {
        logtail.error(`Erro ao copiar Chromium: ${error}`);
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
                name: 'queue1.json',
                content: { players: [] }
            },
            {
                name: 'queue2.json',
                content: { players: [] }
            },
            {
                name: 'queue3.json',
                content: { players: [] }
            },
            {
                name: 'robots.json',
                content: { 
                    robots: [
                        { id: 1, status: 'stopped', queueFile: 'queue1.json', lastRunTime: null },
                        { id: 2, status: 'stopped', queueFile: 'queue2.json', lastRunTime: null },
                        { id: 3, status: 'stopped', queueFile: 'queue3.json', lastRunTime: null }
                    ]
                }
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

    logtail.info('Assets copiados com sucesso!');
}

async function copyEnvironmentFiles() {
    const envPath = path.join(process.cwd(), '.env');
    const executableEnvPath = path.join('executable', '.env');

    try {
        if (await fs.pathExists(envPath)) {
            await fs.copy(envPath, executableEnvPath);
            logtail.info('Arquivo .env copiado com sucesso!');
        }
    } catch (error) {
        logtail.error(`Erro ao copiar arquivo .env: ${error}`);
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

        logtail.info('Arquivos do Prisma copiados com sucesso!');
    } catch (error) {
        logtail.error(`Erro ao copiar arquivos do Prisma: ${error}`);
        throw error;
    }
}

async function main() {
    try {
        // 1. Copia assets e arquivos de ambiente primeiro
        await copyAssets();
        await copyEnvironmentFiles();
        await copyPrismaFiles();
        
        // 2. Executa o prisma generate para o executável
        logtail.info('Gerando cliente Prisma...');
        const { execSync } = require('child_process');
        execSync('npx prisma generate --schema=./executable/prisma/schema.prisma');

        // 3. Inicializa o banco de dados usando o setupExecutableDatabase
        logtail.info('Inicializando banco de dados...');
        const { setupExecutableDatabase } = require('./scripts/setupExecutableDatabase');
        await setupExecutableDatabase();

        logtail.info('Deploy concluído com sucesso!');
    } catch (error) {
        logtail.error(`Erro durante o deploy: ${error}`);
        throw error;
    }
}

main().catch((error) => {
    logtail.error(`Erro fatal durante o deploy: ${error}`);
});