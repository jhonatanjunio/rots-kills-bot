import fs from 'fs-extra';
import path from 'path';
import { logtail } from '../utils/logtail';

interface RateLimitHistory {
  timestamp: number;
  playerId?: number;
  robotId?: number;
  errorType: '429' | '403' | 'timeout' | 'other';
  url?: string;
}

interface ProcessingProgress {
  robotId: number;
  lastProcessedPlayerId: number | null;
  lastProcessedTimestamp: number | null;
  currentPhase: 'initializing' | 'processing' | 'paused' | 'error_recovery';
  errorCount: number;
  errorStreakStart: number | null;
}

interface RateLimitConfig {
  baseCooldown: number;
  maxCooldown: number;
  errorMultiplier: number;
  successReduction: number;
  pauseDuration: number; // Tempo de pausa após múltiplos 429s
  maxErrorsBeforePause: number;
}

interface RateLimitState {
  lastUpdated: number;
  globalCooldown: number;
  isGloballyPaused: boolean;
  pauseUntil: number | null;
  pauseReason: string | null;
  history: RateLimitHistory[];
  robotProgress: ProcessingProgress[];
  config: RateLimitConfig;
  totalErrors: number;
  totalSuccesses: number;
  lastSuccessTimestamp: number | null;
}

export class RateLimitStateService {
  private static instance: RateLimitStateService;
  private static readonly STATE_PATH = path.join(process.cwd(), 'database', 'rateLimitState.json');
  private static readonly HISTORY_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas
  private static readonly HISTORY_MAX_ENTRIES = 1000;
  
  private state: RateLimitState;

  private constructor() {
    this.state = this.getDefaultState();
  }

  static getInstance(): RateLimitStateService {
    if (!RateLimitStateService.instance) {
      RateLimitStateService.instance = new RateLimitStateService();
    }
    return RateLimitStateService.instance;
  }

  private getDefaultState(): RateLimitState {
    return {
      lastUpdated: Date.now(),
      globalCooldown: 60000, // 1 minuto base
      isGloballyPaused: false,
      pauseUntil: null,
      pauseReason: null,
      history: [],
      robotProgress: [],
      config: {
        baseCooldown: 60000,
        maxCooldown: 600000, // 10 minutos
        errorMultiplier: 1.5,
        successReduction: 0.9,
        pauseDuration: 300000, // 5 minutos de pausa
        maxErrorsBeforePause: 10
      },
      totalErrors: 0,
      totalSuccesses: 0,
      lastSuccessTimestamp: null
    };
  }

  async load(): Promise<void> {
    try {
      // Garante que o diretório existe
      await fs.ensureDir(path.dirname(RateLimitStateService.STATE_PATH));
      
      // Tenta carregar o arquivo de estado
      if (await fs.pathExists(RateLimitStateService.STATE_PATH)) {
        const data = await fs.readJSON(RateLimitStateService.STATE_PATH);
        this.state = { ...this.getDefaultState(), ...data };
        
        // Limpa histórico antigo
        this.cleanOldHistory();
        
        // Verifica se ainda está em pausa
        if (this.state.isGloballyPaused && this.state.pauseUntil) {
          if (Date.now() > this.state.pauseUntil) {
            this.clearGlobalPause();
          }
        }
        
        logtail.info(`Estado de rate limiting carregado. Cooldown atual: ${Math.round(this.state.globalCooldown/1000)}s`);
      } else {
        // Primeira execução - salva o estado padrão
        await this.save();
        logtail.info('Estado de rate limiting inicializado com valores padrão');
      }
    } catch (error) {
      logtail.error(`Erro ao carregar estado de rate limiting: ${error}`);
      this.state = this.getDefaultState();
    }
  }

  async save(): Promise<void> {
    try {
      this.state.lastUpdated = Date.now();
      await fs.writeJSON(RateLimitStateService.STATE_PATH, this.state, { spaces: 2 });
    } catch (error) {
      logtail.error(`Erro ao salvar estado de rate limiting: ${error}`);
    }
  }

  private cleanOldHistory(): void {
    const now = Date.now();
    this.state.history = this.state.history
      .filter(entry => now - entry.timestamp < RateLimitStateService.HISTORY_MAX_AGE)
      .slice(-RateLimitStateService.HISTORY_MAX_ENTRIES);
  }

  // Registra um erro de rate limiting
  async recordError(errorType: '429' | '403' | 'timeout' | 'other', details?: {
    playerId?: number;
    robotId?: number;
    url?: string;
  }): Promise<void> {
    const errorEntry: RateLimitHistory = {
      timestamp: Date.now(),
      errorType,
      ...details
    };

    this.state.history.push(errorEntry);
    this.state.totalErrors++;
    
    // Aplica estratégia baseada no tipo de erro
    switch (errorType) {
      case '429':
        await this.handle429Error(details?.robotId);
        break;
      case '403':
        await this.handle403Error();
        break;
      case 'timeout':
        await this.handleTimeoutError();
        break;
      default:
        await this.handleGenericError();
    }

    await this.save();
  }

  private async handle429Error(robotId?: number): Promise<void> {
    // Conta erros 429 recentes (últimos 5 minutos)
    const recentErrors = this.getRecentErrors('429', 5 * 60 * 1000);
    
    if (recentErrors.length >= this.state.config.maxErrorsBeforePause) {
      // Muitos 429s - pausa global
      await this.setGlobalPause(
        this.state.config.pauseDuration,
        `Muitos erros 429 (${recentErrors.length}) nos últimos 5 minutos`
      );
      logtail.warn(`🛑 Pausa global ativada por ${Math.round(this.state.config.pauseDuration/60000)} minutos devido a múltiplos erros 429`);
    } else {
      // Aumenta cooldown gradualmente
      this.state.globalCooldown = Math.min(
        this.state.config.maxCooldown,
        this.state.globalCooldown * this.state.config.errorMultiplier
      );
      
      // Se há um robô específico, marca como em erro
      if (robotId) {
        this.updateRobotProgress(robotId, 'error_recovery');
      }
      
      // Log discreto sem poluir o console
      logtail.info(`⏳ Cooldown ajustado para ${Math.round(this.state.globalCooldown/1000)}s após erro 429`);
    }
  }

  private async handle403Error(): Promise<void> {
    // 403 pode indicar problema com cookies ou IP bloqueado
    // Pausa por mais tempo
    await this.setGlobalPause(
      this.state.config.pauseDuration * 2,
      'Erro 403 detectado - possível bloqueio'
    );
    logtail.warn(`🚫 Pausa global ativada por erro 403 - possível bloqueio de IP ou cookies inválidos`);
  }

  private async handleTimeoutError(): Promise<void> {
    // Timeout pode ser temporário, aumenta cooldown moderadamente
    this.state.globalCooldown = Math.min(
      this.state.config.maxCooldown,
      this.state.globalCooldown * 1.2
    );
    logtail.info(`⏱️ Cooldown ajustado para ${Math.round(this.state.globalCooldown/1000)}s após timeout`);
  }

  private async handleGenericError(): Promise<void> {
    // Erro genérico, aumento pequeno no cooldown
    this.state.globalCooldown = Math.min(
      this.state.config.maxCooldown,
      this.state.globalCooldown * 1.1
    );
  }

  // Registra um sucesso
  async recordSuccess(details?: { playerId?: number; robotId?: number }): Promise<void> {
    this.state.totalSuccesses++;
    this.state.lastSuccessTimestamp = Date.now();
    
    // Reduz cooldown gradualmente em caso de sucesso
    this.state.globalCooldown = Math.max(
      this.state.config.baseCooldown,
      this.state.globalCooldown * this.state.config.successReduction
    );

    if (details?.robotId) {
      this.updateRobotProgress(details.robotId, 'processing', details.playerId);
    }

    await this.save();
  }

  private getRecentErrors(errorType: string, timeWindow: number): RateLimitHistory[] {
    const now = Date.now();
    return this.state.history.filter(
      entry => entry.errorType === errorType && now - entry.timestamp < timeWindow
    );
  }

  private async setGlobalPause(duration: number, reason: string): Promise<void> {
    this.state.isGloballyPaused = true;
    this.state.pauseUntil = Date.now() + duration;
    this.state.pauseReason = reason;
    
    // Marca todos os robôs como pausados
    for (const progress of this.state.robotProgress) {
      progress.currentPhase = 'paused';
    }
  }

  private clearGlobalPause(): void {
    this.state.isGloballyPaused = false;
    this.state.pauseUntil = null;
    this.state.pauseReason = null;
    
    // Retorna robôs para processamento
    for (const progress of this.state.robotProgress) {
      if (progress.currentPhase === 'paused') {
        progress.currentPhase = 'processing';
      }
    }
    
    logtail.info(`✅ Pausa global removida - retomando processamento`);
  }

  // Atualiza progresso de um robô
  updateRobotProgress(
    robotId: number, 
    phase: ProcessingProgress['currentPhase'],
    playerId?: number
  ): void {
    let progress = this.state.robotProgress.find(p => p.robotId === robotId);
    
    if (!progress) {
      progress = {
        robotId,
        lastProcessedPlayerId: null,
        lastProcessedTimestamp: null,
        currentPhase: 'initializing',
        errorCount: 0,
        errorStreakStart: null
      };
      this.state.robotProgress.push(progress);
    }

    progress.currentPhase = phase;
    
    if (playerId) {
      progress.lastProcessedPlayerId = playerId;
      progress.lastProcessedTimestamp = Date.now();
    }

    if (phase === 'error_recovery') {
      progress.errorCount++;
      if (!progress.errorStreakStart) {
        progress.errorStreakStart = Date.now();
      }
    } else if (phase === 'processing') {
      progress.errorCount = 0;
      progress.errorStreakStart = null;
    }
  }

  // Verifica se pode processar agora
  canProcess(): { allowed: boolean; waitTime?: number; reason?: string } {
    const now = Date.now();

    // Verifica pausa global
    if (this.state.isGloballyPaused && this.state.pauseUntil) {
      if (now < this.state.pauseUntil) {
        return {
          allowed: false,
          waitTime: this.state.pauseUntil - now,
          reason: this.state.pauseReason || 'Pausa global ativa'
        };
      } else {
        // Pausa expirou
        this.clearGlobalPause();
      }
    }

    return { allowed: true };
  }

  // Obtém cooldown atual
  getCurrentCooldown(): number {
    return this.state.globalCooldown;
  }

  // Obtém estatísticas
  getStats(): any {
    const now = Date.now();
    const recentErrors = this.getRecentErrors('429', 60 * 60 * 1000); // Última hora
    const recent429s = this.getRecentErrors('429', 5 * 60 * 1000); // Últimos 5 minutos
    const recent403s = this.getRecentErrors('403', 30 * 60 * 1000); // Últimos 30 minutos
    
    // Análise de tendências
    const errorTrend = this.analyzeErrorTrend();
    const recommendedAction = this.getRecommendedAction();
    
    return {
      globalCooldown: Math.round(this.state.globalCooldown / 1000),
      isGloballyPaused: this.state.isGloballyPaused,
      pauseUntil: this.state.pauseUntil ? new Date(this.state.pauseUntil).toISOString() : null,
      pauseReason: this.state.pauseReason,
      totalErrors: this.state.totalErrors,
      totalSuccesses: this.state.totalSuccesses,
      recentErrors: recentErrors.length,
      recent429s: recent429s.length,
      recent403s: recent403s.length,
      successRate: this.calculateSuccessRate(),
      robotProgress: this.state.robotProgress,
      lastSuccess: this.state.lastSuccessTimestamp ? new Date(this.state.lastSuccessTimestamp).toISOString() : null,
      trends: {
        errorTrend,
        recommendedAction,
        timeToNextOptimization: this.getTimeToNextOptimization()
      }
    };
  }

  private calculateSuccessRate(): number {
    const total = this.state.totalSuccesses + this.state.totalErrors;
    if (total === 0) return 100;
    return Math.round((this.state.totalSuccesses / total) * 100 * 100) / 100;
  }

  private analyzeErrorTrend(): 'improving' | 'stable' | 'worsening' | 'unknown' {
    const now = Date.now();
    const last30Min = this.getRecentErrors('429', 30 * 60 * 1000);
    const last10Min = this.getRecentErrors('429', 10 * 60 * 1000);
    
    if (last30Min.length === 0) return 'stable';
    if (last30Min.length < 5 && last10Min.length === 0) return 'improving';
    if (last10Min.length > last30Min.length * 0.5) return 'worsening';
    
    return 'stable';
  }

  private getRecommendedAction(): string {
    const stats = this.analyzeCurrentState();
    
    if (this.state.isGloballyPaused) {
      return 'Aguardando fim da pausa global';
    }
    
    if (stats.recent429s > 5) {
      return 'Considerar aumento no cooldown base';
    }
    
    if (stats.recent403s > 0) {
      return 'Possível bloqueio - verificar cookies e IP';
    }
    
    if (stats.successRate > 90 && this.state.globalCooldown > this.state.config.baseCooldown * 1.5) {
      return 'Sistema estável - reduzir cooldown gradualmente';
    }
    
    if (stats.successRate < 70) {
      return 'Taxa de sucesso baixa - investigar problemas';
    }
    
    return 'Sistema funcionando normalmente';
  }

  private analyzeCurrentState() {
    const now = Date.now();
    return {
      recent429s: this.getRecentErrors('429', 5 * 60 * 1000).length,
      recent403s: this.getRecentErrors('403', 30 * 60 * 1000).length,
      successRate: this.calculateSuccessRate(),
      timeSinceLastSuccess: this.state.lastSuccessTimestamp ? now - this.state.lastSuccessTimestamp : null
    };
  }

  private getTimeToNextOptimization(): number | null {
    // Otimização automática a cada 30 minutos se não houver erros recentes
    if (this.state.lastSuccessTimestamp) {
      const timeSinceSuccess = Date.now() - this.state.lastSuccessTimestamp;
      const nextOptimization = 30 * 60 * 1000; // 30 minutos
      
      if (timeSinceSuccess < nextOptimization) {
        return nextOptimization - timeSinceSuccess;
      }
    }
    
    return null;
  }

  // Método para otimização automática do cooldown
  async optimizeCooldown(): Promise<void> {
    const stats = this.analyzeCurrentState();
    const now = Date.now();
    
    // Não otimiza se houver erros recentes
    if (stats.recent429s > 0 || stats.recent403s > 0) {
      return;
    }
    
    // Não otimiza se não houve atividade recente
    if (!this.state.lastSuccessTimestamp || now - this.state.lastSuccessTimestamp > 60 * 60 * 1000) {
      return;
    }
    
    // Se a taxa de sucesso é alta e o cooldown está acima do mínimo, reduz gradualmente
    if (stats.successRate > 95 && this.state.globalCooldown > this.state.config.baseCooldown) {
      const oldCooldown = this.state.globalCooldown;
      this.state.globalCooldown = Math.max(
        this.state.config.baseCooldown,
        this.state.globalCooldown * 0.9
      );
      
      if (oldCooldown !== this.state.globalCooldown) {
        await this.save();
        // Log da otimização usando SmartLogger se disponível
        try {
          const { SmartLogger } = await import('../utils/smartLogger');
          SmartLogger.stats(`Cooldown otimizado automaticamente`, {
            from: Math.round(oldCooldown/1000),
            to: Math.round(this.state.globalCooldown/1000),
            successRate: stats.successRate
          }, { service: 'RateLimitState' });
        } catch {
          // SmartLogger não disponível, usa logtail diretamente
          const { logtail } = await import('../utils/logtail');
          logtail.info(`Cooldown otimizado: ${Math.round(oldCooldown/1000)}s → ${Math.round(this.state.globalCooldown/1000)}s (Taxa de sucesso: ${stats.successRate}%)`);
        }
      }
    }
  }

  // Limpa estado (para manutenção)
  async reset(): Promise<void> {
    this.state = this.getDefaultState();
    await this.save();
    logtail.info('Estado de rate limiting foi resetado');
  }
} 