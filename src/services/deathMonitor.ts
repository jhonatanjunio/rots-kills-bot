import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Database } from './database';
import { GameAPI } from './gameApi';
import config from '../config/config.json';
import { formatTimestamp } from '../utils/formatters';

export class DeathMonitor {
  private static instance: DeathMonitor;
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastChecks: Map<string, number> = new Map();
  private readonly CHECK_INTERVAL = 60000; // 1 minuto
  private readonly BATCH_SIZE = 3; // Número de jogadores verificados por intervalo
  private readonly BATCH_DELAY = 2000; // 2 segundos entre cada jogador do batch
  private readonly MAX_REQUESTS_PER_MINUTE = 30;
  private requestCount = 0;
  private lastResetTime = Date.now();

  constructor(private client: Client) {}

  static initialize(client: Client): DeathMonitor {
    if (!this.instance) {
      this.instance = new DeathMonitor(client);
    }
    return this.instance;
  }

  async start() {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(async () => {
      await this.checkBatch();
    }, this.CHECK_INTERVAL);

    console.log('Monitor de mortes iniciado');
  }

  private async checkBatch() {
    try {
      const players = await Database.getAllMonitoredPlayers();
      const existingDeathLogs = await Database.getAllDeathLogs();

      for (const player of players) {
        try {
          console.log(`🔍 Monitorando: ${player.name}`);
          const { deaths } = await GameAPI.getPlayerInfo(player.name);

          if (deaths && deaths.length > 0) {
            const playerDeaths = deaths.filter((death: any) => death.is_player === 1);
            const lastCheck = this.lastChecks.get(player.id.toString()) || 0;
            const lastCheckInSeconds = Math.floor(lastCheck / 1000);

            const newDeaths = playerDeaths.filter((death: any) => {
              if (death.time <= lastCheckInSeconds) return false;

              const deathExists = existingDeathLogs.some(log => 
                log.playerName === player.name &&
                log.timestamp === death.time &&
                log.killed_by === death.killed_by &&
                log.mostdamage_by === death.mostdamage_by &&
                log.level === death.level
              );

              return !deathExists;
            });

            if (newDeaths.length > 0) {
              console.log(`⚠️ Nova morte detectada para ${player.name}`);
              await this.processNewDeaths(player, newDeaths);
            }
          }

          this.lastChecks.set(player.id.toString(), Date.now());
        } catch (error) {
          console.error(`❌ Erro ao verificar jogador ${player.name}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Erro no checkBatch:', error);
    }
  }

  private async processNewDeaths(player: any, deaths: any[]) {
    console.log('Processando novas mortes:', { player, deaths });
    const channel = this.client.channels.cache.get(config.discord.deathLogChannel) as TextChannel;
    if (!channel) {
      console.error('Canal não encontrado');
      return;
    }

    for (const death of deaths) {
      try {
        console.log('Salvando morte no banco:', death);
        await Database.addDeathLog({
          playerName: player.name,
          killed_by: death.killed_by,
          mostdamage_by: death.mostdamage_by,
          timestamp: death.time,
          level: death.level
        });
        console.log('Morte salva com sucesso');

        const getAvatar = GameAPI.getAvatar(player.vocation);

        // Cria um embed rico para a mensagem de alerta
        const deathAlert = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⚠️ ALERTA DE MORTE ⚠️')
          .setThumbnail(getAvatar?.url || 'https://saiyansreturn.com/icon.ico')
          .addFields(
            { 
              name: '🎯 Guerreiro Caído', 
              value: `**${player.name}** (Level ${death.level})`, 
              inline: false 
            },
            { 
              name: '💀 Assassino', 
              value: `**${death.killed_by}**`, 
              inline: true 
            },
            { 
              name: '⚔️ Maior Dano', 
              value: `**${death.mostdamage_by}**`, 
              inline: true 
            },
            {
              name: '⏰ Data/Hora', 
              value: formatTimestamp(death.time), 
              inline: false 
            }
          )
          .setFooter({ text: 'Mantenha-se alerta! Proteja seus aliados!' })
          .setTimestamp();

        await channel.send({ embeds: [deathAlert] });
      } catch (error) {
        console.error('Erro ao processar morte:', error);
      }
    }
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('Monitor de mortes parado');
    }
  }

  private async checkRateLimit(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastResetTime >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }
    
    this.requestCount++;
    return true;
  }
} 