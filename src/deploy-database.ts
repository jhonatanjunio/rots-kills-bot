import fs from 'fs-extra';
import path from 'path';
import puppeteer from 'puppeteer';

async function copyChromium() {
    try {
        // Obtém o caminho do executável do Chromium usando a nova API
        const executablePath = puppeteer.executablePath();
        const chromiumPath = path.join('executable', '.local-chromium');
        
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
            }
        ]
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

async function main() {
    await copyAssets();
}

main().catch(console.error);