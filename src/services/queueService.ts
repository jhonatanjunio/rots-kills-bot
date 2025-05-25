import fs from 'fs-extra';
import path from 'path';
import { Player } from '../models/Player';
import { Database } from './database';
import { BrowserService } from './browserService';
import { logtail } from '../utils/logtail';
import { randomInt } from 'crypto';

interface QueuePlayer {
  id: number;
  name: string;
  status: 'pending' | 'processing' | 'erroed' | 'done';
  errorCount: number;
  lastProcessed: number | null;
}

interface RobotInfo {
  id: number;
  status: 'running' | 'stopped';
  queueFile: string;
  lastRunTime: number | null;
}

export class QueueService {
  private static instance: QueueService;
  private static readonly QUEUE_PATH = path.join(process.cwd(), 'database');
  private static readonly ROBOTS_PATH = path.join(process.cwd(), 'database', 'robots.json');
  private static readonly MAX_ERROR_COUNT = 3;
  private static readonly MIN_DELAY = 30000; // 30 segundos
  private static readonly MAX_DELAY = 60000; // 60 segundos
  private static readonly MAX_CONCURRENT_BROWSERS = 3;
  private static readonly GLOBAL_COOLDOWN = 60000; // 1 minuto de cooldown global entre requisições
  
  private robots: RobotInfo[] = [];
  private browserInstances: Map<number, any> = new Map();
  private isInitialized = false;
  private robotIntervals: Map<number, NodeJS.Timeout> = new Map();
  private lastRequestTime: number = 0;
  private globalCooldown: number = QueueService.GLOBAL_COOLDOWN;

  private constructor() {
    // Construtor privado para Singleton
  }

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.ensureQueueFiles();
      await this.loadRobots();
      await this.distributePlayers();
      this.isInitialized = true;
      logtail.info(`Serviço de fila inicializado com ${this.robots.length} robôs`);
    } catch (error) {
      logtail.error(`Erro ao inicializar serviço de fila: ${error}`);
      throw error;
    }
  }

  private async ensureQueueFiles(): Promise<void> {
    try {
      // Garante que o diretório existe
      await fs.ensureDir(QueueService.QUEUE_PATH);
      
      // Lista de arquivos a serem verificados/criados
      const files = [
        { path: path.join(QueueService.QUEUE_PATH, 'queue1.json'), content: { players: [] } },
        { path: path.join(QueueService.QUEUE_PATH, 'queue2.json'), content: { players: [] } },
        { path: path.join(QueueService.QUEUE_PATH, 'queue3.json'), content: { players: [] } },
        { path: path.join(QueueService.QUEUE_PATH, 'robots.json'), content: { 
          robots: [
            { id: 1, status: 'stopped', queueFile: 'queue1.json', lastRunTime: null },
            { id: 2, status: 'stopped', queueFile: 'queue2.json', lastRunTime: null },
            { id: 3, status: 'stopped', queueFile: 'queue3.json', lastRunTime: null }
          ]
        }}
      ];

      // Verifica e cria cada arquivo se não existir
      for (const file of files) {
        try {
          await fs.access(file.path);
        } catch {
          await fs.writeJSON(file.path, file.content, { spaces: 2 });
          logtail.info(`Arquivo de fila criado: ${path.basename(file.path)}`);
        }
      }
    } catch (error) {
      logtail.error(`Erro ao garantir arquivos de fila: ${error}`);
      throw error;
    }
  }

  private async loadRobots(): Promise<void> {
    try {
      const content = await fs.readJSON(QueueService.ROBOTS_PATH);
      this.robots = content.robots;
      logtail.info(`Carregados ${this.robots.length} robôs do arquivo`);
    } catch (error) {
      logtail.error(`Erro ao carregar robôs: ${error}`);
      throw error;
    }
  }

  async saveRobots(): Promise<void> {
    try {
      await fs.writeJSON(
        QueueService.ROBOTS_PATH, 
        { robots: this.robots }, 
        { spaces: 2 }
      );
    } catch (error) {
      logtail.error(`Erro ao salvar robôs: ${error}`);
      throw error;
    }
  }

  private async loadQueue(queueFile: string): Promise<QueuePlayer[]> {
    try {
      const filePath = path.join(QueueService.QUEUE_PATH, queueFile);
      const content = await fs.readJSON(filePath);
      return content.players || [];
    } catch (error) {
      logtail.error(`Erro ao carregar fila ${queueFile}: ${error}`);
      return [];
    }
  }

  private async saveQueue(queueFile: string, players: QueuePlayer[]): Promise<void> {
    try {
      const filePath = path.join(QueueService.QUEUE_PATH, queueFile);
      await fs.writeJSON(filePath, { players }, { spaces: 2 });
    } catch (error) {
      logtail.error(`Erro ao salvar fila ${queueFile}: ${error}`);
      throw error;
    }
  }

  async distributePlayers(): Promise<void> {
    try {
      // Busca todos os jogadores monitorados
      const players = await Database.getAllMonitoredPlayers();
      
      if (players.length === 0) {
        logtail.info('Nenhum jogador para distribuir nas filas');
        return;
      }
      
      // Limpa todas as filas existentes
      for (const robot of this.robots) {
        await this.saveQueue(robot.queueFile, []);
      }
      
      // Calcula quantos jogadores por fila
      const playersPerQueue = Math.ceil(players.length / this.robots.length);
      
      // Distribui os jogadores nas filas
      for (let i = 0; i < this.robots.length; i++) {
        const robot = this.robots[i];
        const start = i * playersPerQueue;
        const end = Math.min(start + playersPerQueue, players.length);
        
        if (start >= players.length) continue;
        
        const queuePlayers: QueuePlayer[] = players
          .slice(start, end)
          .map(player => ({
            id: player.id,
            name: player.name,
            status: 'pending' as const,
            errorCount: 0,
            lastProcessed: null
          }));
        
        await this.saveQueue(robot.queueFile, queuePlayers);
        logtail.info(`Distribuídos ${queuePlayers.length} jogadores para a fila ${robot.queueFile}`);
      }
    } catch (error) {
      logtail.error(`Erro ao distribuir jogadores: ${error}`);
      throw error;
    }
  }

  async startRobots(): Promise<void> {
    try {
      logtail.info('Iniciando robôs de processamento de fila...');
      
      // Inicia apenas um robô de cada vez, com intervalo entre eles
      for (let i = 0; i < this.robots.length; i++) {
        await this.startRobot(this.robots[i].id);
        
        // Espera 2 minutos entre iniciar cada robô
        if (i < this.robots.length - 1) {
          logtail.info(`Aguardando 2 minutos antes de iniciar o próximo robô...`);
          await new Promise(resolve => setTimeout(resolve, 120000));
        }
      }
    } catch (error) {
      logtail.error(`Erro ao iniciar robôs: ${error}`);
      throw error;
    }
  }

  async startRobot(robotId: number): Promise<void> {
    try {
      const robot = this.robots.find(r => r.id === robotId);
      if (!robot) {
        logtail.error(`Robô ${robotId} não encontrado`);
        return;
      }
      
      if (robot.status === 'running') {
        logtail.info(`Robô ${robotId} já está em execução`);
        return;
      }
      
      // Atualiza status do robô
      robot.status = 'running';
      await this.saveRobots();
      
      // Inicia o browser para este robô
      const browser = await this.initBrowser(robotId);
      this.browserInstances.set(robotId, browser);
      
      // Agenda o processamento periódico da fila com intervalo mais longo
      const interval = setInterval(async () => {
        await this.processQueue(robotId);
      }, 5000); // Verifica a cada 5 segundos, mas o processamento terá delay interno
      
      this.robotIntervals.set(robotId, interval);
      
      logtail.info(`Robô ${robotId} iniciado com sucesso`);
    } catch (error) {
      logtail.error(`Erro ao iniciar robô ${robotId}: ${error}`);
      throw error;
    }
  }

  async stopRobot(robotId: number): Promise<void> {
    try {
      const robot = this.robots.find(r => r.id === robotId);
      if (!robot) {
        logtail.error(`Robô ${robotId} não encontrado`);
        return;
      }
      
      // Para o intervalo de processamento
      const interval = this.robotIntervals.get(robotId);
      if (interval) {
        clearInterval(interval);
        this.robotIntervals.delete(robotId);
      }
      
      // Fecha o browser
      const browser = this.browserInstances.get(robotId);
      if (browser) {
        await browser.close();
        this.browserInstances.delete(robotId);
      }
      
      // Atualiza status do robô
      robot.status = 'stopped';
      await this.saveRobots();
      
      logtail.info(`Robô ${robotId} parado com sucesso`);
    } catch (error) {
      logtail.error(`Erro ao parar robô ${robotId}: ${error}`);
      throw error;
    }
  }

  async stopAllRobots(): Promise<void> {
    try {
      logtail.info('Parando todos os robôs...');
      
      for (const robot of this.robots) {
        if (robot.status === 'running') {
          await this.stopRobot(robot.id);
        }
      }
      
      logtail.info('Todos os robôs foram parados');
    } catch (error) {
      logtail.error(`Erro ao parar todos os robôs: ${error}`);
      throw error;
    }
  }

  private async initBrowser(robotId: number): Promise<any> {
    try {
      logtail.info(`Iniciando navegador para robô ${robotId}`);
      return await BrowserService.initialize();
    } catch (error) {
      logtail.error(`Erro ao iniciar navegador para robô ${robotId}: ${error}`);
      throw error;
    }
  }

  // Novo método para aguardar o cooldown global
  private async waitForGlobalCooldown(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.globalCooldown) {
      const waitTime = this.globalCooldown - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Método para aumentar o cooldown global após erros
  private increaseGlobalCooldown(): void {
    // Aumenta o cooldown em 50% a cada erro, até um máximo de 5 minutos
    this.globalCooldown = Math.min(300000, this.globalCooldown * 1.5);
    logtail.warn(`Cooldown global aumentado para ${Math.round(this.globalCooldown/1000)}s`);
  }

  private async processQueue(robotId: number): Promise<void> {
    const robot = this.robots.find(r => r.id === robotId);
    if (!robot || robot.status !== 'running') return;
    
    try {
      // Carrega a fila atual
      const queue = await this.loadQueue(robot.queueFile);
      
      // Verifica se há jogadores pendentes na fila
      const pendingPlayer = queue.find(p => p.status === 'pending');
      
      if (!pendingPlayer) {
        // Se não há jogadores pendentes, verifica se todos estão concluídos
        const allDone = queue.every(p => p.status === 'done' || p.status === 'erroed');
        
        if (allDone) {
          logtail.info(`Robô ${robotId}: Todos os jogadores processados. Reiniciando fila...`);
          // Reinicia a fila
          const resetQueue: QueuePlayer[] = queue.map(p => ({
            ...p,
            status: 'pending',
            errorCount: 0,
            lastProcessed: null
          }));
          
          await this.saveQueue(robot.queueFile, resetQueue);
          logtail.info(`Robô ${robotId}: Fila reiniciada com ${resetQueue.length} jogadores`);
        }
        
        // Não há processamento a fazer agora
        return;
      }
      
      logtail.info(`Robô ${robotId}: Iniciando processamento do jogador ${pendingPlayer.name} (ID: ${pendingPlayer.id})`);
      
      // Aguarda o cooldown global antes de processar
      await this.waitForGlobalCooldown();
      
      // Atualiza o jogador para status 'processing'
      const updatedQueue: QueuePlayer[] = queue.map(p => {
        if (p.id === pendingPlayer.id) {
          return { ...p, status: 'processing' };
        }
        return p;
      });
      
      await this.saveQueue(robot.queueFile, updatedQueue);
      
      // Processa o jogador
      logtail.info(`Robô ${robotId}: Buscando dados do jogador ${pendingPlayer.name}`);
      
      // Busca informações do jogador APENAS usando o método do navegador
      const browser = this.browserInstances.get(robotId);
      if (!browser) {
        logtail.error(`Browser não encontrado para robô ${robotId}`);
        throw new Error(`Browser não encontrado para robô ${robotId}`);
      }
      
      // Usamos diretamente o método Puppeteer para evitar os problemas com fetch
      const response = await BrowserService.getPuppeteerPlayerData(pendingPlayer.id);
      
      if (response.error || !response.data) {
        logtail.warn(`Robô ${robotId}: Erro ao buscar dados do jogador ${pendingPlayer.name}: ${response.message}`);
        this.increaseGlobalCooldown();
        
        const errorQueue: QueuePlayer[] = queue.map(p => {
          if (p.id === pendingPlayer.id) {
            const newErrorCount = p.errorCount + 1;
            return { 
              ...p, 
              status: newErrorCount >= QueueService.MAX_ERROR_COUNT ? 'erroed' : 'pending',
              errorCount: newErrorCount,
              lastProcessed: Date.now()
            };
          }
          return p;
        });
        
        const updatedPlayer = errorQueue.find(p => p.id === pendingPlayer.id);
        if (updatedPlayer) {
          logtail.info(`Robô ${robotId}: Jogador ${pendingPlayer.name} - Erro ${updatedPlayer.errorCount}/${QueueService.MAX_ERROR_COUNT}`);
        }
        
        await this.saveQueue(robot.queueFile, errorQueue);
      } else {
        logtail.info(`Robô ${robotId}: Dados do jogador ${pendingPlayer.name} obtidos com sucesso`);
        
        // Sucesso: atualiza o banco de dados e marca como concluído
        const playerData = response.data;
        
        const player: Player = {
          id: playerData.id,
          name: playerData.name,
          level: playerData.level,
          vocation: playerData.vocation.id,
          isAlly: (await Database.getPlayer(playerData.name))?.isAlly || false
        };
        
        // Atualiza o jogador no banco de dados
        await Database.updatePlayer(player);
        logtail.info(`Robô ${robotId}: Dados do jogador ${player.name} atualizados no banco`);
        
        // Processa mortes se houver
        if (playerData.deaths && playerData.deaths.deaths?.length > 0) {
          logtail.info(`Robô ${robotId}: Processando ${playerData.deaths.deaths.length} mortes do jogador ${player.name}`);
          await this.processDeaths(player, playerData.deaths.deaths);
        }
        
        // Atualiza o status do jogador na fila
        const successQueue: QueuePlayer[] = queue.map(p => {
          if (p.id === pendingPlayer.id) {
            return { 
              ...p, 
              status: 'done',
              errorCount: 0,
              lastProcessed: Date.now()
            };
          }
          return p;
        });
        
        await this.saveQueue(robot.queueFile, successQueue);
        logtail.info(`Robô ${robotId}: Processamento do jogador ${pendingPlayer.name} concluído com sucesso`);
        
        // Reduz gradualmente o cooldown quando há sucesso
        this.globalCooldown = Math.max(QueueService.GLOBAL_COOLDOWN, this.globalCooldown * 0.9);
      }
      
      // Atualiza o tempo da última execução
      robot.lastRunTime = Date.now();
      await this.saveRobots();
      
      const delay = randomInt(QueueService.MIN_DELAY, QueueService.MAX_DELAY);
      logtail.info(`Robô ${robotId}: Aguardando ${Math.round(delay/1000)}s antes do próximo processamento`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      logtail.error(`Erro durante processamento da fila do robô ${robotId}: ${error}`);
      
      // Em caso de erro não tratado, aumenta o cooldown drasticamente
      this.globalCooldown = Math.min(600000, this.globalCooldown * 2);
      logtail.warn(`Erro crítico - Cooldown global aumentado para ${Math.round(this.globalCooldown/1000)}s`);
    }
  }
  
  private async processDeaths(player: Player, deaths: any[]): Promise<void> {
    try {
      // Separa mortes por jogadores e por monstros
      const playerDeaths = deaths.filter(death => death.is_player === 1);
      const monsterDeaths = deaths.filter(death => 
        death.is_player === 0 && 
        this.isFromToday(death.time)
      );
      
      // Processa mortes por jogadores
      for (const death of playerDeaths) {
        const deathLog = {
          playerName: player.name,
          killed_by: death.killed_by,
          mostdamage_by: death.mostdamage_by,
          timestamp: death.time,
          level: death.level
        };
        
        const added = await Database.addPlayerDeathLog(deathLog);
        if (added) {
          logtail.info(`Nova morte por jogador registrada para ${player.name}`);
        }
      }
      
      // Processa mortes por monstros
      for (const death of monsterDeaths) {
        const deathLog = {
          playerName: player.name,
          killed_by: death.killed_by,
          mostdamage_by: death.mostdamage_by,
          timestamp: death.time,
          level: death.level
        };
        
        const added = await Database.addMonsterDeathLog(deathLog);
        if (added) {
          logtail.info(`Nova morte por monstro registrada para ${player.name}`);
        }
        
        // Verifica se mostdamage_by é um jogador monitorado
        const isMostDamagePlayer = await Database.isMonitoredPlayer(death.mostdamage_by);
        if (isMostDamagePlayer) {
          // Adiciona como morte por player para contabilizar assistência
          await Database.addPlayerDeathLog(deathLog);
        }
      }
    } catch (error) {
      logtail.error(`Erro ao processar mortes para ${player.name}: ${error}`);
    }
  }
  
  private isFromToday(timestamp: number): boolean {
    const date = new Date(timestamp * 1000);
    const today = new Date();
    
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }
  
  getQueueStats(): any {
    const stats: any = {};
    
    for (const robot of this.robots) {
      stats[`robô_${robot.id}`] = {
        status: robot.status,
        queueFile: robot.queueFile,
        lastRunTime: robot.lastRunTime ? new Date(robot.lastRunTime).toISOString() : null
      };
    }
    
    stats.cooldown = {
      global_cooldown_seconds: Math.round(this.globalCooldown / 1000),
      last_request: this.lastRequestTime ? new Date(this.lastRequestTime).toISOString() : null
    };
    
    return stats;
  }
} 