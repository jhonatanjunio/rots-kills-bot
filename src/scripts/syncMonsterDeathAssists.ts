import { Database } from '../services/database';
import { logtail } from '../utils/logtail';

async function syncMonsterDeathAssists() {
    try {
        console.log('🔄 Iniciando sincronização de assistências em mortes por monstros...');
        logtail.info('Iniciando sincronização de assistências em mortes por monstros');

        // Carrega todos os dados necessários
        await Database.load();
        const monsterDeaths = await Database.getAllMonsterDeathLogs();
        const players = await Database.getAllMonitoredPlayers();

        let syncCount = 0;
        const playerNames = new Set(players.map(p => p.name.toLowerCase()));

        for (const death of monsterDeaths) {
            // Verifica se o mostdamage_by é um jogador monitorado
            if (playerNames.has(death.mostdamage_by.toLowerCase())) {
                try {
                    // Tenta adicionar como morte por player para contabilizar a assistência
                    const added = await Database.addPlayerDeathLog({
                        playerName: death.playerName,
                        killed_by: death.killed_by,
                        mostdamage_by: death.mostdamage_by,
                        timestamp: death.timestamp,
                        level: death.level
                    });

                    if (added) {
                        syncCount++;
                        console.log(`✅ Sincronizada morte de ${death.playerName} (morto por ${death.killed_by}) com assistência de ${death.mostdamage_by}`);
                    }
                } catch (error) {
                    console.error(`❌ Erro ao sincronizar morte: ${error}`);
                    logtail.error(`Erro ao sincronizar morte: ${error}`);
                }
            }
        }

        console.log(`\n✨ Sincronização concluída!`);
        console.log(`📊 Total de registros sincronizados: ${syncCount}`);
        logtail.info(`Sincronização concluída. Total de registros sincronizados: ${syncCount}`);

    } catch (error) {
        console.error('❌ Erro durante a sincronização:', error);
        logtail.error(`Erro durante a sincronização: ${error}`);
    }
}

// Executa o script
syncMonsterDeathAssists();