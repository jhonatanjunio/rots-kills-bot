import fs from 'fs/promises';
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
      if (this.data.players.length > 0) {
        await this.save();
      }
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
    const dataToSave = {
      players: this.data.players
    };
    await fs.writeFile(this.DB_PATH, JSON.stringify(dataToSave, null, 2));
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
}
