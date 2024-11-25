import fs from 'fs-extra';
import path from 'path';
import { Player } from '../models/Player';
import { DeathLogEntry } from '../models/Deathlog';
import { logtail } from '../utils/logtail';

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
  private static readonly BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutos
  private static backupInterval: NodeJS.Timeout | null = null;
  private static isWriting = false;
  private static writeQueue: Array<() => Promise<void>> = [];

  private static createDeathLogHash(deathLog: DeathLogEntry): string {
    return `${deathLog.playerName}-${deathLog.killed_by}-${deathLog.mostdamage_by}-${deathLog.timestamp}-${deathLog.level}`;
  }

  static async load() {
    try {
      const content = await fs.readFile(this.DB_PATH, 'utf-8');
      const loadedData = JSON.parse(content);
      this.data.players = loadedData.players;
    } catch (error) {
      logtail.error(`Erro ao carregar dados do banco de dados: ${error}`);
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
    }
  }
  
  static async addPlayer(player: Player) {
    this.data.players.push(player);
    await this.save();
  }

  static async getPlayer(playerName: string): Promise<Player | null> {
    return this.data.players.find(p => p.name.toLowerCase() === playerName.toLowerCase()) || null;
  }

  static async updatePlayer(player: Player) {
    const index = this.data.players.findIndex(p => p.id === player.id);
    if (index !== -1) {
      this.data.players[index] = player;
      await this.save();
    }
  }

  static async removePlayer(playerId: number) {
    this.data.players = this.data.players.filter(p => p.id != playerId);
    await this.save();
  }

  private static async save() {
    if (this.isWriting) {
      return new Promise<void>((resolve, reject) => {
        this.writeQueue.push(async () => {
          try {
            await this._save();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    this.isWriting = true;
    try {
      await this._save();
    } finally {
      this.isWriting = false;
      if (this.writeQueue.length > 0) {
        const nextWrite = this.writeQueue.shift();
        if (nextWrite) nextWrite();
      }
    }
  }

  private static async _save() {
    const dataToSave = {
      players: this.data.players
    };
    await this.safeWrite(this.DB_PATH, dataToSave);
  }

  private static async savePlayerDeaths() {
    const dataToSave = {
      playerDeathLogs: this.data.playerDeathLogs
    };
    await fs.writeFile(this.PLAYER_DEATHS_PATH, JSON.stringify(dataToSave, null, 2));
  }

  private static async saveMonsterDeaths() {
    const dataToSave = {
      monsterDeathLogs: this.data.monsterDeathLogs
    };
    await fs.writeFile(this.MONSTER_DB_PATH, JSON.stringify(dataToSave, null, 2));
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
      logtail.error(`Erro ao adicionar monster death log: ${error}`);
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

    // Garante que o diretório database existe
    await fs.mkdir('database', { recursive: true });

    for (const file of files) {
      const fullPath = path.join(process.cwd(), file.path);
      
      try {
        // Verifica se o arquivo existe
        await fs.access(fullPath);
        // Se existe, não faz nada
        logtail.info(`Arquivo ${file.path} já existe, mantendo conteúdo atual`);
      } catch {
        // Cria o arquivo APENAS se ele não existir
        await fs.writeFile(fullPath, JSON.stringify(file.content, null, 2));
        logtail.info(`Arquivo ${file.path} criado com sucesso`);
      }
    }
  }

  static async isMonitoredPlayer(playerName: string): Promise<boolean> {
    return this.data.players.some(
      player => player.name.toLowerCase() === playerName.toLowerCase()
    );
  }

  private static async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'database', 'backups');
    
    try {
      await fs.mkdir(backupDir, { recursive: true });
      
      // Copia os arquivos principais para backup
      for (const file of ['data.json', 'playerDeaths.json', 'monsterDeaths.json']) {
        const sourcePath = path.join(process.cwd(), 'database', file);
        const backupPath = path.join(backupDir, `${file}.backup`);
        
        if (await fs.pathExists(sourcePath)) {
          await fs.copy(sourcePath, backupPath, { overwrite: true });
        }
      }
    } catch (error) {
      logtail.error(`Erro ao criar backup: ${error}`);
    }
  }

  private static async safeWrite(file: string, data: any) {
    const tempFile = `${file}.temp`;
    const backupFile = `${file}.bak`;

    try {
      // Escreve primeiro em um arquivo temporário
      await fs.writeJson(tempFile, data, { spaces: 2 });
      
      // Se existe um arquivo original, faz backup dele
      if (await fs.pathExists(file)) {
        await fs.copy(file, backupFile);
      }
      
      // Renomeia o arquivo temporário para o nome final
      await fs.move(tempFile, file, { overwrite: true });
      
      // Remove o backup se tudo deu certo
      if (await fs.pathExists(backupFile)) {
        await fs.remove(backupFile);
      }
    } catch (error) {
      // Se algo deu errado e existe backup, restaura
      if (await fs.pathExists(backupFile)) {
        await fs.copy(backupFile, file);
      }
      throw error;
    }
  }

  static startBackupService() {
    if (!this.backupInterval) {
      this.backupInterval = setInterval(() => {
        this.createBackup();
      }, this.BACKUP_INTERVAL);
    }
  }

  static stopBackupService() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }

  static async saveAll() {
    await this._save();
    await this.savePlayerDeaths();
    await this.saveMonsterDeaths();
  }
}
