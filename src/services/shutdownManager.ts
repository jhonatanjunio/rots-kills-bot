import { Client } from 'discord.js';
import { Database } from './database';
import { DeathMonitor } from './deathMonitor';
import { logtail } from '../utils/logtail';

export class ShutdownManager {
    private static isShuttingDown = false;
    private static shutdownPromise: Promise<void> | null = null;

    static async shutdown(signal?: string, client?: Client): Promise<void> {
        if (this.isShuttingDown) {
            logtail.warn('Processo de desligamento já em andamento');
            return this.shutdownPromise!;
        }

        this.isShuttingDown = true;
        this.shutdownPromise = this.executeShutdown(signal, client);
        return this.shutdownPromise;
    }

    private static async executeShutdown(signal?: string, client?: Client): Promise<void> {
        const shutdownMessage = signal
            ? `\n🛑 Recebido sinal ${signal}. Iniciando desligamento gracioso...`
            : '🛑 Iniciando processo de desligamento...';

        console.log(shutdownMessage);
        logtail.info(shutdownMessage);

        try {
            // 1. Para o monitor de mortes
            const monitor = DeathMonitor.getInstance();
            if (monitor) {
                console.log('⏹️ Parando monitor de mortes...');
                monitor.stop();
            }

            // 2. Para o serviço de backup
            console.log('⏹️ Parando serviço de backup...');
            Database.stopBackupService();

            // 3. Força um último backup no Prisma
            console.log('💾 Realizando backup final no Prisma...');
            await Database.createBackup();

            // 4. Salva todos os dados
            console.log('💾 Salvando dados finais...');
            await Database.saveAll();

            // 5. Desconecta o cliente do Discord se existir
            if (client) {
                console.log('👋 Desconectando do Discord...');
                await client.destroy();
            }

            console.log('✅ Processo de desligamento concluído com sucesso');
            logtail.info('Processo de desligamento concluído com sucesso');

            // Aguarda um momento para garantir que todos os logs foram escritos
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            const errorMessage = `❌ Erro durante o desligamento: ${error}`;
            console.error(errorMessage);
            logtail.error(errorMessage);
            throw error;
        }
    }

    static isInProgress(): boolean {
        return this.isShuttingDown;
    }
}