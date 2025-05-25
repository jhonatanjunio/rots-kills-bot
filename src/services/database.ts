import fs from 'fs-extra';
import path from 'path';
import { Player } from '../models/Player';
import { DeathLogEntry } from '../models/Deathlog';
import { logtail } from '../utils/logtail';
import { scheduleJob } from 'node-schedule';
import { getPrismaService } from './prisma';

interface DatabaseSchema {
  players: Player[];
  playerDeathLogs: DeathLogEntry[];
  monsterDeathLogs: DeathLogEntry[];
  playerDeathLogsIndex: Set<string>;
  monsterDeathLogsIndex: Set<string>;
}

export class Database {
  private static data: DatabaseSchema = {
    players: [],
    playerDeathLogs: [],
    monsterDeathLogs: [],
    playerDeathLogsIndex: new Set(),
    monsterDeathLogsIndex: new Set()
  };
  private static readonly DB_PATH = path.join(process.cwd(), 'database', 'data.json');
  private static readonly PLAYER_DEATHS_PATH = path.join(process.cwd(), 'database', 'playerDeaths.json');
  private static readonly MONSTER_DB_PATH = path.join(process.cwd(), 'database', 'monsterDeaths.json');
  private static backupInterval: NodeJS.Timeout | null = null;
  private static readonly BACKUP_INTERVAL = 5 * 60 * 1000;
  private static isRestoringFromBackup = false;
  private static restorePromise: Promise<void> | null = null;

  private static async waitForRestore() {
    if (this.isRestoringFromBackup && this.restorePromise) {
      logtail.info('Aguardando restauração de backup concluir...');
      await this.restorePromise;
    }
  }

  private static async restoreFromBackup(): Promise<void> {
    // Se já está restaurando, aguarda a restauração atual
    if (this.isRestoringFromBackup) {
      return this.restorePromise!;
    }

    this.isRestoringFromBackup = true;
    this.restorePromise = (async () => {
      try {
        logtail.info('Iniciando restauração dos dados do Prisma...');
        
        // Busca dados do Prisma
        const prismaService = await getPrismaService();
        const prisma = prismaService.getClient();
        const prismaPlayers = await prisma.player.findMany();
        
        if (!prismaPlayers || prismaPlayers.length === 0) {
          throw new Error('Nenhum dado encontrado no Prisma para restauração');
        }

        // Atualiza dados em memória
        this.data.players = prismaPlayers.map(player => ({
          id: player.id,
          name: player.name,
          level: player.level,
          vocation: player.vocation,
          isAlly: player.isAlly
        }));

        // Tenta reescrever o arquivo data.json
        const dataToSave = {
          players: this.data.players
        };

        await fs.writeFile(this.DB_PATH, JSON.stringify(dataToSave, null, 2));
        
        logtail.info('Restauração do backup concluída com sucesso');
      } catch (error) {
        logtail.error(`Erro durante a restauração do backup: ${error}`);
        throw error;
      } finally {
        this.isRestoringFromBackup = false;
        this.restorePromise = null;
      }
    })();

    return this.restorePromise;
  }

  private static createDeathLogHash(deathLog: DeathLogEntry): string {
    return `${deathLog.playerName}-${deathLog.killed_by}-${deathLog.mostdamage_by}-${deathLog.timestamp}-${deathLog.level}`;
  }

  static async initialize() {
    await this.ensureDatabaseFiles();
    await this.load();
    await this.syncWithPrisma();
    await this.loadFromPrisma();
    this.setupBackupSchedule();
  }

  private static async syncWithPrisma() {
    try {
      console.log('🔄 Sincronizando dados com Prisma...');
      
      // Se temos dados no data.json mas o Prisma está vazio, populamos o Prisma
      const prismaService = await getPrismaService();
      const prisma = prismaService.getClient();
      const prismaPlayers = await prisma.player.count();
      
      if (prismaPlayers === 0 && this.data.players.length > 0) {
        console.log(`📥 Importando ${this.data.players.length} jogadores para o Prisma...`);
        
        await prisma.player.createMany({
          data: this.data.players.map(player => ({
            id: player.id,
            name: player.name,
            level: player.level,
            vocation: player.vocation,
            isAlly: player.isAlly
          }))
        });
        
        console.log('✅ Dados sincronizados com sucesso!');
      } else if (prismaPlayers > 0 && this.data.players.length === 0) {
        // Se o Prisma tem dados mas o data.json está vazio, restauramos do Prisma
        console.log(`📤 Restaurando ${prismaPlayers} jogadores do Prisma...`);
        await this.restoreFromBackup();
      }
    } catch (error) {
      console.error('❌ Erro ao sincronizar com Prisma:', error);
      logtail.error(`Erro ao sincronizar com Prisma: ${error}`);
    }
  }

  private static async loadFromPrisma() {
    try {
      const prismaService = await getPrismaService();
      const prismaPlayers = await prismaService.getClient().player.findMany();
      this.data.players = prismaPlayers.map(player => ({
        id: player.id,
        name: player.name,
        level: player.level,
        vocation: player.vocation,
        isAlly: player.isAlly
      }));
    } catch (error) {
      logtail.error(`Erro ao carregar dados do Prisma: ${error}`);
    }
  }

  private static async saveBackupToPrisma() {
    const prismaService = await getPrismaService();
    const prisma = prismaService.getClient();
    try {
      await prisma.$transaction(async (tx) => {
        // Limpa dados existentes
        await tx.player.deleteMany();
        
        // Insere novos dados
        await tx.player.createMany({
          data: this.data.players
        });
      });
      
      logtail.info('Backup no Prisma realizado com sucesso');
    } catch (error) {
      logtail.error(`Erro ao fazer backup no Prisma: ${error}`);
      throw error;
    }
  }

  private static setupBackupSchedule() {
    scheduleJob('*/5 * * * *', async () => {
      try {
        await this.saveBackupToPrisma();
      } catch (error) {
        logtail.error(`Erro no backup automático: ${error}`);
      }
    });
  }

  static async createBackup(): Promise<void> {
    try {
      const prismaService = await getPrismaService();
      const prisma = prismaService.getClient();
      
      // Cria um timestamp para logging
      const timestamp = new Date().toISOString();
      logtail.info(`Iniciando backup no Prisma - ${timestamp}`);

      await prisma.$transaction(async (tx) => {
        // Limpa dados existentes
        await tx.player.deleteMany();
        
        // Insere novos dados
        await tx.player.createMany({
          data: this.data.players.map(player => ({
            id: player.id,
            name: player.name,
            level: player.level,
            vocation: player.vocation,
            isAlly: player.isAlly
          }))
        });
      });

      logtail.info(`Backup no Prisma concluído com sucesso - ${timestamp}`);
    } catch (error) {
      logtail.error(`Erro ao criar backup no Prisma: ${error}`);
      throw error;
    }
  }

  static async load() {
    await this.waitForRestore();

    try {
      await this.loadFromPrisma();
      
      if (this.data.players.length === 0) {
        try {
          const content = await fs.readFile(this.DB_PATH, 'utf-8');
          const loadedData = JSON.parse(content);
          this.data.players = loadedData.players;
        } catch (error) {
          logtail.error(`Erro ao ler arquivo data.json: ${error}`);
          await this.restoreFromBackup();
        }
      }
    } catch (error) {
      logtail.error(`Erro ao carregar dados: ${error}`);
      throw error;
    }

    try {
      const content = await fs.readFile(this.PLAYER_DEATHS_PATH, 'utf-8');
      const loadedData = JSON.parse(content);
      this.data.playerDeathLogs = loadedData.playerDeathLogs;
      this.data.playerDeathLogsIndex = new Set(
        this.data.playerDeathLogs.map(this.createDeathLogHash)
      );
    } catch (error) {
      logtail.error(`Erro ao carregar dados dos logs de mortes dos players: ${error}`);
      if (this.data.playerDeathLogs.length > 0) {
        await this.savePlayerDeaths();
      }
    }

    try {
      const content = await fs.readFile(this.MONSTER_DB_PATH, 'utf-8');
      const loadedData = JSON.parse(content);
      this.data.monsterDeathLogs = loadedData.monsterDeathLogs;
      this.data.monsterDeathLogsIndex = new Set(
        this.data.monsterDeathLogs.map(this.createDeathLogHash)
      );
    } catch (error) {
      logtail.error(`Erro ao carregar dados dos logs de mortes dos monstros: ${error}`);
      if (this.data.monsterDeathLogs.length > 0) {
        await this.saveMonsterDeaths();
      }
    }
  }

  static async addPlayer(player: Player) {
    await this.waitForRestore();
    this.data.players.push(player);
    await this.save();
  }

  static async getPlayer(playerName: string): Promise<Player | null> {
    await this.waitForRestore();
    return this.data.players.find(p => p.name.toLowerCase() === playerName.toLowerCase()) || null;
  }

  static async updatePlayer(player: Player) {
    await this.waitForRestore();
    const index = this.data.players.findIndex(p => p.id === player.id);
    if (index !== -1) {
      this.data.players[index] = player;
      await this.save();
    }
  }

  static async removePlayer(playerId: number) {
    await this.waitForRestore();
    this.data.players = this.data.players.filter(p => p.id != playerId);
    await this.save();
  }

  private static async writeFileWithRetry(filePath: string, data: string, maxRetries = 3): Promise<void> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        await fs.writeFile(filePath, data);
        return;
      } catch (error: any) {
        if (error.code === 'EBUSY' && attempt < maxRetries - 1) {
          attempt++;
          logtail.warn(`Arquivo ocupado, tentativa ${attempt} de ${maxRetries}`);
          // Aguarda 1 segundo antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }
  }

  private static async save() {
    await this.waitForRestore();

    try {
      if (!this.data.players || this.data.players.length === 0) {
        logtail.error('Tentativa de salvar players com array vazio bloqueada');
        throw new Error('Proteção contra salvamento de array vazio ativada');
      }

      try {
        const dataToSave = {
          players: this.data.players
        };
        await this.writeFileWithRetry(this.DB_PATH, JSON.stringify(dataToSave, null, 2));
      } catch (error) {
        logtail.error(`Erro ao salvar arquivo data.json: ${error}`);
        await this.restoreFromBackup();
      }
    } catch (error) {
      logtail.error(`Erro ao salvar dados: ${error}`);
      throw error;
    }
  }

  private static async savePlayerDeaths() {
    const dataToSave = {
      playerDeathLogs: this.data.playerDeathLogs
    };
    await this.writeFileWithRetry(this.PLAYER_DEATHS_PATH, JSON.stringify(dataToSave, null, 2));
  }

  private static async saveMonsterDeaths() {
    const dataToSave = {
      monsterDeathLogs: this.data.monsterDeathLogs
    };
    await this.writeFileWithRetry(this.MONSTER_DB_PATH, JSON.stringify(dataToSave, null, 2));
  }

  static async addPlayerDeathLog(deathLog: DeathLogEntry): Promise<boolean> {
    try {
      const hash = this.createDeathLogHash(deathLog);
      if (this.data.playerDeathLogsIndex.has(hash)) {
        return false;
      }
      this.data.playerDeathLogs.push(deathLog);
      this.data.playerDeathLogsIndex.add(hash);
      await this.savePlayerDeaths();
      return true;
    } catch (error) {
      console.error('Erro ao adicionar player death log:', error);
      logtail.error(`Erro ao adicionar player death log: ${error}`);
      return false;
    }
  }

  static async addMonsterDeathLog(deathLog: DeathLogEntry): Promise<boolean> {
    try {
      const hash = this.createDeathLogHash(deathLog);
      if (this.data.monsterDeathLogsIndex.has(hash)) {
        return false;
      }
      this.data.monsterDeathLogs.push(deathLog);
      this.data.monsterDeathLogsIndex.add(hash);
      await this.saveMonsterDeaths();
      return true;
    } catch (error) {
      console.error('Erro ao adicionar monster death log:', error);
      return false;
    }
  }

  static async getPlayerDeathLogs(playerName: string): Promise<DeathLogEntry[]> {
    return this.data.playerDeathLogs.filter((log: DeathLogEntry) => log.playerName === playerName);
  }

  static async getAllMonitoredPlayers(): Promise<Player[]> {
    return [...this.data.players];
  }

  static async getAllPlayerDeathLogs(): Promise<DeathLogEntry[]> {
    return [...this.data.playerDeathLogs];
  }

  static async getAllMonsterDeathLogs(): Promise<DeathLogEntry[]> {
    return [...this.data.monsterDeathLogs];
  }

  static async ensureDatabaseFiles() {
    const files = [
      { path: 'database/data.json', content: { players: [] } },
      { path: 'database/playerDeaths.json', content: { playerDeathLogs: [] } },
      { path: 'database/monsterDeaths.json', content: { monsterDeathLogs: [] } }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        // Se o diretório não existir, cria
        await fs.mkdir('database', { recursive: true });
        // Cria o arquivo com conteúdo inicial
        await fs.writeFile(file.path, JSON.stringify(file.content, null, 2));
        logtail.error(`Erro ao criar arquivo: ${file.path}`);
      }
    }
  }

  static async isMonitoredPlayer(playerName: string): Promise<boolean> {
    return this.data.players.some(
      player => player.name.toLowerCase() === playerName.toLowerCase()
    );
  }

  static async saveAll(): Promise<void> {
    try {
      await this.save();
      await this.savePlayerDeaths();
      await this.saveMonsterDeaths();
      logtail.info('Todos os dados salvos com sucesso');
    } catch (error) {
      logtail.error(`Erro ao salvar todos os dados: ${error}`);
      throw error;
    }
  }

  static startBackupService(): void {
    if (this.backupInterval) {
      return;
    }

    this.backupInterval = setInterval(async () => {
      try {
        await this.createBackup();
        logtail.info('Backup automático realizado com sucesso');
      } catch (error) {
        logtail.error(`Erro no backup automático: ${error}`);
      }
    }, this.BACKUP_INTERVAL);

    logtail.info('Serviço de backup iniciado');
  }

  static stopBackupService(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      logtail.info('Serviço de backup parado');
    }
  }

  static async updatePlayerName(oldName: string, newName: string): Promise<boolean> {
    try {
      const player = await this.getPlayer(oldName);
      if (!player) return false;

      player.name = newName;
      await this.updatePlayer(player);
      
      // Atualiza também os logs de morte
      for (const deathLog of this.data.playerDeathLogs) {
        if (deathLog.playerName === oldName) {
          deathLog.playerName = newName;
        }
      }

      for (const deathLog of this.data.monsterDeathLogs) {
        if (deathLog.playerName === oldName) {
          deathLog.playerName = newName;
        }
      }

      await this.saveAll();
      logtail.info(`Nome do jogador atualizado: ${oldName} -> ${newName}`);
      return true;
    } catch (error) {
      logtail.error(`Erro ao atualizar nome do jogador: ${error}`);
      return false;
    }
  }
}