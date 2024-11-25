import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Database } from './database';
import { GameAPI } from './gameApi';
import config from '../config';
import { formatTimestamp } from '../utils/formatters';
import { Player } from '../models/Player';
import { isFromToday } from '../utils/formatters';
import { logtail } from '../utils/logtail';

export class DeathMonitor {
  private static instance: DeathMonitor;
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastChecks: Map<string, number> = new Map();
  private readonly BASE_INTERVAL = 150000; // 2.5 minutos
  private readonly BATCH_SIZE = 20; // 20 jogadores por lote
  private readonly MAX_CONCURRENT_TABS = 15; // Máximo de abas simultâneas
  private currentInterval: number = this.BASE_INTERVAL;
  private processingTimes: number[] = [];
  private lastSuccessfulRun: number = Date.now();

  constructor(private client: Client) {}

  public static getInstance(): DeathMonitor | null {
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

    const runMonitor = async () => {
      try {
        await this.processAllPlayers();
      } catch (error) {
        logtail.error(`❌ Erro crítico no monitor: ${error}`);
      } finally {
        // Garante que o próximo intervalo seja sempre agendado
        this.monitorInterval = setTimeout(runMonitor, this.currentInterval);
      }
    };

    // Primeira execução imediata
    await runMonitor();

    logtail.info('Monitor de mortes iniciado com intervalo dinâmico');
  }

  private async processAllPlayers() {
    try {
      const startTime = Date.now();
      const players = await Database.getAllMonitoredPlayers();
      const totalPlayers = players.length;
      
      logtail.info(`🔄 Iniciando processamento de ${totalPlayers} jogadores`);

      // Divide os jogadores em lotes
      const batches = this.createBatches(players, this.BATCH_SIZE);
      
      for (const batch of batches) {
        const batchStartTime = Date.now();
        await this.processBatchWithConcurrency(batch);
        
        const batchProcessingTime = Date.now() - batchStartTime;
        this.updateProcessingMetrics(batchProcessingTime, batch.length);
      }

      const totalProcessingTime = Date.now() - startTime;
      this.adjustInterval(totalProcessingTime, totalPlayers);

      this.lastSuccessfulRun = Date.now();
      logtail.info(`✅ Processamento completo em ${Date.now() - startTime}ms`);
      logtail.info(`⏱️ Próxima verificação em ${this.currentInterval / 1000}s`);

    } catch (error) {
      logtail.error(`❌ Erro no processamento: ${error}`);
      throw error; // Propaga o erro para ser tratado no start()
    }
  }

  private async processBatchWithConcurrency(players: Player[]) {
    const chunks = this.createBatches(players, this.MAX_CONCURRENT_TABS);
    
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(player => this.processPlayer(player))
      );
    }
  }

  private createBatches<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }

  private updateProcessingMetrics(processingTime: number, batchSize: number) {
    const timePerPlayer = processingTime / batchSize;
    this.processingTimes.push(timePerPlayer);
    
    // Mantém apenas as últimas 10 medições
    if (this.processingTimes.length > 10) {
      this.processingTimes.shift();
    }
  }

  private adjustInterval(totalTime: number, totalPlayers: number) {
    const averageTimePerPlayer = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    const estimatedTotalTime = averageTimePerPlayer * totalPlayers;
    
    // Ajusta o intervalo baseado no tempo de processamento
    this.currentInterval = Math.round(Math.max(
      this.BASE_INTERVAL,
      Math.min(estimatedTotalTime * 1.2, 300000) // Máximo de 5 minutos
    ));
    
    logtail.info(`Intervalo ajustado para ${this.currentInterval}ms`);
  }

  private async processPlayer(player: Player) {
    try {
      console.log(`🔍 Monitorando: ${player.name}`);
      const { player: updatedPlayer, deaths } = await GameAPI.getPlayerInfo(player.name);

      if (updatedPlayer) {
        await this.checkVocationChange(player, updatedPlayer.vocation);
      }

      if (deaths && deaths.length > 0) {
        const playerDeaths = deaths.filter((death: any) => death.is_player === 1);
        const monsterDeaths = deaths.filter((death: any) => 
          death.is_player === 0 && isFromToday(death.time)
        );

        const lastCheck = this.lastChecks.get(player.id.toString()) || 0;
        const lastCheckInSeconds = Math.floor(lastCheck / 1000);

        const existingPlayerDeathLogs = await Database.getAllPlayerDeathLogs();
        const existingMonsterDeathLogs = await Database.getAllMonsterDeathLogs();

        const newPlayerDeaths = playerDeaths.filter((death: any) => {
          if (death.time <= lastCheckInSeconds) return false;
          return !this.deathExists(death, player.name, existingPlayerDeathLogs);
        });

        const newMonsterDeaths = monsterDeaths.filter((death: any) => {
          if (death.time <= lastCheckInSeconds) return false;
          return !this.deathExists(death, player.name, existingMonsterDeathLogs);
        });

        if (newPlayerDeaths.length > 0) {
          console.log(`⚠️ Nova morte detectada para ${player.name}`);
          await this.processNewDeaths(player, newPlayerDeaths);
        }

        if (newMonsterDeaths.length > 0) {
          console.log(`⚠️ Nova morte por monstro detectada para ${player.name}`);
          await this.processNewMonsterDeaths(player, newMonsterDeaths);
        }
      }

      this.lastChecks.set(player.id.toString(), Date.now());
    } catch (error) {
      logtail.error(`❌ Erro ao processar jogador ${player.name}: ${error}`);
    }
  }

  private deathExists(death: any, playerName: string, existingLogs: any[]): boolean {
    return existingLogs.some(log => 
      log.playerName === playerName &&
      log.timestamp === death.time &&
      log.killed_by === death.killed_by &&
      log.mostdamage_by === death.mostdamage_by &&
      log.level === death.level
    );
  }

  private async checkVocationChange(oldPlayer: Player, newVocation: number) {
    if (oldPlayer.vocation !== newVocation) {
      const channel = this.client.channels.cache.get(config.discord.playerClassChangeChannel) as TextChannel;
      if (!channel) {
        console.error('Canal de mudança de classe não encontrado');
        return;
      }

      const oldAvatar = GameAPI.getAvatar(oldPlayer.vocation) || { name: 'Não encontrado', url: 'https://saiyansreturn.com/icon.ico' };
      const newAvatar = GameAPI.getAvatar(newVocation) || { name: 'Não encontrado', url: 'https://saiyansreturn.com/icon.ico' };
      
      const vocationChangeAlert = new EmbedBuilder()
        .setColor(oldPlayer.isAlly ? '#00FF00' : '#FF0000')
        .setTitle(`🔄 MUDANÇA DE CLASSE DE UM ${oldPlayer.isAlly ? 'ALIADO' : 'INIMIGO'} 🔄`)
        .setDescription(`O jogador **${oldPlayer.name}** mudou de classe!`)
        .addFields(
          { name: 'Classe Anterior', value: oldAvatar.name, inline: true },
          { name: 'Nova Classe', value: newAvatar.name, inline: true },
        )
        .setThumbnail(oldAvatar.url)
        .setImage(newAvatar.url)
        .setTimestamp();

      await channel.send({ embeds: [vocationChangeAlert] });

      // Atualiza o banco de dados com a nova vocação
      oldPlayer.vocation = newVocation;
      await Database.updatePlayer(oldPlayer);
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
        await Database.addPlayerDeathLog({
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
      } catch (error) {
        console.error('Erro ao processar morte:', error);
        logtail.error(`Erro ao processar morte: ${error}`);
      }
    }
  }

  private async processNewMonsterDeaths(player: any, deaths: any[]) {
    console.log('Processando novas mortes por monstros:', { player, deaths });
    const channel = this.client.channels.cache.get(config.discord.monsterDeathLogChannel) as TextChannel;
    if (!channel) {
      console.error('Canal de mortes por monstros não encontrado');
      return;
    }

    for (const death of deaths) {
      try {
        if (!isFromToday(death.time)) {
          console.log(`Ignorando morte por monstro antiga de ${player.name} (${formatTimestamp(death.time)})`);
          continue;
        }

        // Salva a morte por monstro
        await Database.addMonsterDeathLog({
          playerName: player.name,
          killed_by: death.killed_by,
          mostdamage_by: death.mostdamage_by,
          timestamp: death.time,
          level: death.level
        });

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
        }

        const getAvatar = GameAPI.getAvatar(player.vocation);
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
      } catch (error) {
        console.error('Erro ao processar morte por monstro:', error);
        logtail.error(`Erro ao processar morte por monstro: ${error}`);
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

  public isHealthy(): boolean {
    const maxAllowedGap = this.currentInterval * 2; // Permite um gap de 2x o intervalo
    return Date.now() - this.lastSuccessfulRun <= maxAllowedGap;
  }
} 