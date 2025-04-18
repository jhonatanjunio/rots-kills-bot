import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Database } from './database';
import { GameAPI } from './gameApi';
import { QueueService } from './queueService';
import config from '../config';
import { formatTimestamp } from '../utils/formatters';
import { Player } from '../models/Player';
import { isFromToday } from '../utils/formatters';
import { logtail } from '../utils/logtail';

export class DeathMonitor {
  private static instance: DeathMonitor | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private queueService: QueueService;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minuto
  private readonly MAX_ERRORS = 3;
  private errorCount: number = 0;
  private lastSuccessfulRun: number = Date.now();
  private hasErrors: boolean = false;
  private lastError: Error | null = null;
  private lastErrorTime: number = 0;

  constructor(private client: Client) {
    this.queueService = QueueService.getInstance();
  }

  static getInstance(): DeathMonitor | null {
    return this.instance;
  }

  static initialize(client: Client): DeathMonitor {
    if (!this.instance) {
      this.instance = new DeathMonitor(client);
    }
    return this.instance;
  }

  async start() {
    if (this.monitorInterval) return;

    try {
      // Inicializa o serviço de fila
      await this.queueService.initialize();
      
      // Inicia os robôs de processamento
      await this.queueService.startRobots();
      
      // Configura verificação periódica de saúde do sistema
      this.monitorInterval = setInterval(() => {
        this.checkHealth();
      }, this.HEALTH_CHECK_INTERVAL);
      
      logtail.info('Monitor de mortes iniciado com sistema de filas');
    } catch (error) {
      logtail.error(`Erro ao iniciar monitor: ${error}`);
      throw error;
    }
  }

  private async checkHealth() {
    try {
      // Obtém estatísticas das filas
      const stats = this.queueService.getQueueStats();
      
      // Verifica se os robôs estão funcionando
      let allStopped = true;
      for (const key in stats) {
        if (stats[key].status === 'running') {
          allStopped = false;
        }
      }
      
      if (allStopped) {
        logtail.warn('Todos os robôs estão parados. Tentando reiniciar...');
        await this.queueService.startRobots();
      }
      
      this.lastSuccessfulRun = Date.now();
      this.errorCount = 0;
      this.hasErrors = false;
    } catch (error) {
      this.errorCount++;
      this.hasErrors = true;
      this.lastError = error as Error;
      this.lastErrorTime = Date.now();
      
      logtail.error(`Erro na verificação de saúde: ${error}`);
      
      // Se excedeu o limite de erros, tenta reiniciar
      if (this.errorCount >= this.MAX_ERRORS) {
        logtail.warn('Limite de erros atingido. Tentando reiniciar os robôs...');
        try {
          await this.queueService.stopAllRobots();
          await this.queueService.startRobots();
          this.errorCount = 0;
        } catch (restartError) {
          logtail.error(`Erro ao reiniciar robôs: ${restartError}`);
        }
      }
    }
  }

  async processVocationChange(player: Player, newVocation: number) {
    if (player.vocation !== newVocation) {
      const channel = this.client.channels.cache.get(config.discord.playerClassChangeChannel) as TextChannel;
      if (!channel) {
        logtail.error('Canal de mudança de classe não encontrado');
        return;
      }

      const oldAvatar = GameAPI.getAvatar(player.vocation) || { name: 'Não encontrado', url: 'https://saiyansreturn.com/icon.ico' };
      const newAvatar = GameAPI.getAvatar(newVocation) || { name: 'Não encontrado', url: 'https://saiyansreturn.com/icon.ico' };

      const vocationChangeAlert = new EmbedBuilder()
        .setColor(player.isAlly ? '#00FF00' : '#FF0000')
        .setTitle(`🔄 MUDANÇA DE CLASSE DE UM ${player.isAlly ? 'ALIADO' : 'INIMIGO'} 🔄`)
        .setDescription(`O jogador **${player.name}** mudou de classe!`)
        .addFields(
          { name: 'Classe Anterior', value: oldAvatar.name, inline: true },
          { name: 'Nova Classe', value: newAvatar.name, inline: true },
        )
        .setThumbnail(oldAvatar.url)
        .setImage(newAvatar.url)
        .setTimestamp();

      await channel.send({ embeds: [vocationChangeAlert] });

      // Atualiza o banco de dados com a nova vocação
      player.vocation = newVocation;
      await Database.updatePlayer(player);
      logtail.info(`Mudança de classe detectada e processada para ${player.name}`);
    }
  }

  async processPlayerNameChange(oldName: string, newName: string, isAlly: boolean) {
    try {
      const channel = this.client.channels.cache.get(config.discord.playerClassChangeChannel) as TextChannel;
      if (channel) {
        const nameChangeAlert = new EmbedBuilder()
          .setColor(isAlly ? '#00FF00' : '#FF0000')
          .setTitle('🔄 MUDANÇA DE NICK DETECTADA 🔄')
          .setDescription(`O jogador alterou seu nick!`)
          .addFields(
            { name: 'Nick Anterior', value: oldName, inline: true },
            { name: 'Novo Nick', value: newName, inline: true }
          )
          .setTimestamp();

        await channel.send({ embeds: [nameChangeAlert] });
        logtail.info(`Mudança de nome detectada e processada: ${oldName} -> ${newName}`);
      }

      // Atualiza o nome no banco de dados
      await Database.updatePlayerName(oldName, newName);
    } catch (error) {
      logtail.error(`Erro ao processar mudança de nome: ${error}`);
    }
  }

  async processPlayerDeath(player: Player, death: any) {
    try {
      await Database.addPlayerDeathLog({
        playerName: player.name,
        killed_by: death.killed_by,
        mostdamage_by: death.mostdamage_by,
        timestamp: death.time,
        level: death.level
      });

      const channel = this.client.channels.cache.get(config.discord.deathLogChannel) as TextChannel;
      if (!channel) {
        logtail.error('Canal de log de mortes não encontrado');
        return;
      }

      const getAvatar = GameAPI.getAvatar(player.vocation);

      // Cria um embed rico para a mensagem de alerta
      const deathAlert = new EmbedBuilder()
        .setColor(player.isAlly ? '#00FF00' : '#FF0000')
        .setTitle('⚠️ ALERTA DE MORTE ⚠️')
        .setThumbnail(getAvatar?.url || 'https://saiyansreturn.com/icon.ico')
        .addFields(
          { name: '🎯 Guerreiro Caído', value: `**${player.name}** (Level ${death.level})`, inline: false },
          { name: '💀 Assassino', value: `**${death.killed_by}**`, inline: true },
          { name: '⚔️ Maior Dano', value: `**${death.mostdamage_by}**`, inline: true },
          { name: '⏰ Data/Hora', value: formatTimestamp(death.time), inline: false }
        )
        .setFooter({ text: 'Mantenha-se alerta! Proteja seus aliados!' })
        .setTimestamp();

      await channel.send({ embeds: [deathAlert] });
      logtail.info(`Morte processada para ${player.name}`);
    } catch (error) {
      logtail.error(`Erro ao processar morte: ${error}`);
    }
  }

  async processMonsterDeath(player: Player, death: any) {
    try {
      if (!isFromToday(death.time)) {
        return;
      }

      // Salva a morte por monstro
      await Database.addMonsterDeathLog({
        playerName: player.name,
        killed_by: death.killed_by,
        mostdamage_by: death.mostdamage_by,
        timestamp: death.time,
        level: death.level
      });

      const channel = this.client.channels.cache.get(config.discord.monsterDeathLogChannel) as TextChannel;
      if (!channel) {
        logtail.error('Canal de mortes por monstros não encontrado');
        return;
      }

      const getAvatar = GameAPI.getAvatar(player.vocation);
      
      // Verifica se o mostdamage_by é um jogador monitorado
      const isMostDamagePlayer = await Database.isMonitoredPlayer(death.mostdamage_by);
      if (isMostDamagePlayer) {
        // Adiciona também como morte por player para contabilizar a assistência
        await Database.addPlayerDeathLog({
          playerName: player.name,
          killed_by: death.killed_by,
          mostdamage_by: death.mostdamage_by,
          timestamp: death.time,
          level: death.level
        });

        // Cria um embed rico para a mensagem de alerta
        const deathAlert = new EmbedBuilder()
          .setColor(player.isAlly ? '#00FF00' : '#FF0000')
          .setTitle('⚠️ ALERTA DE MORTE ⚠️')
          .setThumbnail(getAvatar?.url || 'https://saiyansreturn.com/icon.ico')
          .addFields(
            { name: '🎯 Guerreiro Caído', value: `**${player.name}** (Level ${death.level})`, inline: false },
            { name: '💀 Assassino', value: `**${death.killed_by}**`, inline: true },
            { name: '⚔️ Maior Dano', value: `**${death.mostdamage_by}**`, inline: true },
            { name: '⏰ Data/Hora', value: formatTimestamp(death.time), inline: false }
          )
          .setFooter({ text: 'Mantenha-se alerta! Proteja seus aliados!' })
          .setTimestamp();

        await channel.send({ embeds: [deathAlert] });
      } else {
        const deathAlert = new EmbedBuilder()
          .setColor(player.isAlly ? '#00FF00' : '#FF0000')
          .setTitle(`⚠️ UM ${player.isAlly ? 'ALIADO' : 'INIMIGO'} FOI ELIMINADO POR UM MONSTRO ⚠️`)
          .setThumbnail(getAvatar?.url || 'https://saiyansreturn.com/icon.ico')
          .addFields(
            { name: '🎯 Guerreiro Caído', value: `**${player.name}** (Level ${death.level})`, inline: false },
            { name: '💀 Monstro', value: `**${death.killed_by}**`, inline: true },
            { name: '⚔️ Maior Dano', value: `**${death.mostdamage_by}**`, inline: true },
            { name: '⏰ Data/Hora', value: formatTimestamp(death.time), inline: false }
          )
          .setFooter({ text: 'Cuidado com os monstros!' })
          .setTimestamp();

        await channel.send({ embeds: [deathAlert] });
      }
      
      logtail.info(`Morte por monstro processada para ${player.name}`);
    } catch (error) {
      logtail.error(`Erro ao processar morte por monstro: ${error}`);
    }
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Para todos os robôs
    this.queueService.stopAllRobots().catch(error => {
      logtail.error(`Erro ao parar robôs: ${error}`);
    });
    
    logtail.info('Monitor de mortes parado');
  }

  isHealthy(): boolean {
    const maxErrorAge = 5 * 60 * 1000; // 5 minutos
    const maxTimeSinceLastRun = 5 * 60 * 1000; // 5 minutos

    const isErrorCountOk = this.errorCount < this.MAX_ERRORS;
    const isLastRunRecent = (Date.now() - this.lastSuccessfulRun) < maxTimeSinceLastRun;
    const isErrorOld = !this.lastErrorTime || (Date.now() - this.lastErrorTime) > maxErrorAge;

    return isErrorCountOk && isLastRunRecent && isErrorOld;
  }

  getHealthStatus(): {
    healthy: boolean;
    lastError: Error | null;
    lastErrorTime: number;
    lastSuccessfulRun: number;
    errorCount: number;
    queueStats: any;
  } {
    return {
      healthy: this.isHealthy(),
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
      lastSuccessfulRun: this.lastSuccessfulRun,
      errorCount: this.errorCount,
      queueStats: this.queueService.getQueueStats()
    };
  }

  resetErrors(): void {
    this.errorCount = 0;
    this.hasErrors = false;
    this.lastError = null;
    this.lastErrorTime = 0;
  }
} 