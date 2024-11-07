import fs from 'fs/promises';
import path from 'path';
import { Player } from '../models/Player';
import { DeathLogEntry } from '../models/Deathlog';

interface DatabaseSchema {
  players: Player[];
  deathLogs: DeathLogEntry[];
  deathLogsIndex: Set<string>;
}

export class Database {
  private static data: DatabaseSchema = {
    players: [],
    deathLogs: [],
    deathLogsIndex: new Set()
  };
  private static readonly DB_PATH = path.join(process.cwd(), 'database', 'data.json');

  private static createDeathLogHash(deathLog: DeathLogEntry): string {
    return `${deathLog.playerName}-${deathLog.killed_by}-${deathLog.mostdamage_by}-${deathLog.timestamp}-${deathLog.level}`;
  }

  static async load() {
    try {
      const content = await fs.readFile(this.DB_PATH, 'utf-8');
      const loadedData = JSON.parse(content);
      this.data.players = loadedData.players;
      this.data.deathLogs = loadedData.deathLogs;
      
      // Reconstrói o índice em memória
      this.data.deathLogsIndex = new Set(
        this.data.deathLogs.map(this.createDeathLogHash)
      );
    } catch {
      this.data = { 
        players: [], 
        deathLogs: [], 
        deathLogsIndex: new Set() 
      };
      await this.save();
    }
  }

  private static async save() {
    // Salva apenas os dados, não o índice
    const dataToSave = {
      players: this.data.players,
      deathLogs: this.data.deathLogs
    };
    await fs.writeFile(this.DB_PATH, JSON.stringify(dataToSave, null, 2));
  }

  // Métodos para Players
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

  // Métodos para DeathLogs
  static async addDeathLog(deathLog: DeathLogEntry): Promise<boolean> {
    try {
        console.log('Tentando adicionar death log:');
        const hash = this.createDeathLogHash(deathLog);
        
        if (this.data.deathLogsIndex.has(hash)) {
            console.log('Death log duplicado encontrado');
            return false;
        }

        this.data.deathLogs.push(deathLog);
        this.data.deathLogsIndex.add(hash);
        await this.save();
        console.log('Death log adicionado com sucesso');
        return true;
    } catch (error) {
        console.error('Erro ao adicionar death log:', error);
        return false;
    }
  }

  static async getAllMonitoredPlayers(): Promise<Player[]> {
    return [...this.data.players];
  }

  static async removePlayer(playerId: number) {
    this.data.players = this.data.players.filter(p => p.id != playerId);
    await this.save();
  }

  static async getAllDeathLogs(): Promise<DeathLogEntry[]> {
    return [...this.data.deathLogs];
  }

}
