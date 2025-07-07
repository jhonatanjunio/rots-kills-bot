import { logtail } from './logtail';

interface LogContext {
  robotId?: number;
  playerId?: number;
  service?: string;
  operation?: string;
}

export class SmartLogger {
  private static rateLimitMessages = new Map<string, number>();
  private static readonly RATE_LIMIT_SUPPRESS_TIME = 5 * 60 * 1000; // 5 minutos
  private static readonly MAX_RATE_LIMIT_LOGS_PER_PERIOD = 3;

  // Log de informação normal
  static info(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    logtail.info(`${contextStr}${message}`);
  }

  // Log de debug (mais silencioso)
  static debug(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    logtail.debug(`${contextStr}${message}`);
  }

  // Log de warning com suppressão para rate limiting
  static warn(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    
    // Verifica se é relacionado a rate limiting
    if (this.isRateLimitMessage(message)) {
      if (this.shouldSuppressRateLimitLog(message)) {
        // Log apenas no logtail, não no console
        logtail.debug(`[SUPPRESSED] ${contextStr}${message}`);
        return;
      }
    }
    
    logtail.warn(`${contextStr}${message}`);
  }

  // Log de erro com categorização inteligente
  static error(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    
    // Categoriza o tipo de erro
    if (this.isRateLimitMessage(message)) {
      // Erros de rate limiting são menos críticos
      if (this.shouldSuppressRateLimitLog(message)) {
        logtail.debug(`[RATE_LIMIT_ERROR] ${contextStr}${message}`);
        return;
      }
      logtail.warn(`[RATE_LIMIT] ${contextStr}${message}`);
    } else if (this.isNetworkError(message)) {
      // Erros de rede são temporários
      logtail.warn(`[NETWORK] ${contextStr}${message}`);
    } else if (this.isBrowserError(message)) {
      // Erros de browser podem ser temporários
      logtail.warn(`[BROWSER] ${contextStr}${message}`);
    } else {
      // Erros críticos do sistema
      logtail.error(`[CRITICAL] ${contextStr}${message}`);
    }
  }

  // Log para sucesso em operações importantes
  static success(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    logtail.info(`✅ ${contextStr}${message}`);
  }

  // Log para operações em progresso (usado com parcimônia)
  static progress(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    logtail.info(`🔄 ${contextStr}${message}`);
  }

  // Log para pausas e esperas importantes
  static pause(message: string, duration?: number, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    const durationStr = duration ? ` (${Math.round(duration/1000)}s)` : '';
    logtail.info(`⏸️ ${contextStr}${message}${durationStr}`);
  }

  // Log para retomada de operações
  static resume(message: string, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    logtail.info(`▶️ ${contextStr}${message}`);
  }

  // Log para estatísticas importantes
  static stats(message: string, data?: any, context?: LogContext): void {
    const contextStr = this.formatContext(context);
    const dataStr = data ? ` - ${JSON.stringify(data)}` : '';
    logtail.info(`📊 ${contextStr}${message}${dataStr}`);
  }

  private static formatContext(context?: LogContext): string {
    if (!context) return '';
    
    const parts: string[] = [];
    
    if (context.service) {
      parts.push(`[${context.service}]`);
    }
    
    if (context.robotId) {
      parts.push(`[Robô ${context.robotId}]`);
    }
    
    if (context.playerId) {
      parts.push(`[Player ${context.playerId}]`);
    }
    
    if (context.operation) {
      parts.push(`[${context.operation}]`);
    }
    
    return parts.length > 0 ? `${parts.join(' ')} ` : '';
  }

  private static isRateLimitMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return lowerMessage.includes('429') || 
           lowerMessage.includes('rate limit') || 
           lowerMessage.includes('too many requests') ||
           lowerMessage.includes('cooldown');
  }

  private static isNetworkError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return lowerMessage.includes('timeout') ||
           lowerMessage.includes('connection') ||
           lowerMessage.includes('network') ||
           lowerMessage.includes('fetch');
  }

  private static isBrowserError(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return lowerMessage.includes('browser') ||
           lowerMessage.includes('puppeteer') ||
           lowerMessage.includes('page') ||
           lowerMessage.includes('navigation');
  }

  private static shouldSuppressRateLimitLog(message: string): boolean {
    const now = Date.now();
    const key = this.getRateLimitKey(message);
    
    // Remove entradas antigas
    this.cleanOldRateLimitMessages(now);
    
    const count = this.rateLimitMessages.get(key) || 0;
    
    if (count >= this.MAX_RATE_LIMIT_LOGS_PER_PERIOD) {
      return true; // Suprime
    }
    
    // Incrementa contador
    this.rateLimitMessages.set(key, count + 1);
    
    // Agenda limpeza
    setTimeout(() => {
      this.rateLimitMessages.delete(key);
    }, this.RATE_LIMIT_SUPPRESS_TIME);
    
    return false;
  }

  private static getRateLimitKey(message: string): string {
    // Cria uma chave baseada no tipo de mensagem para agrupar logs similares
    if (message.includes('429')) return 'rate_limit_429';
    if (message.includes('403')) return 'rate_limit_403';
    if (message.includes('cooldown')) return 'cooldown_adjust';
    return 'rate_limit_general';
  }

  private static cleanOldRateLimitMessages(currentTime: number): void {
    // Esta função é chamada quando necessário, não precisa limpar ativamente
    // A limpeza é feita pelo setTimeout individual de cada entrada
  }

  // Método para logs de sistema importantes que nunca devem ser suprimidos
  static system(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const systemMessage = `[SYSTEM ${timestamp}] ${message}`;
    
    switch (level) {
      case 'error':
        logtail.error(systemMessage);
        break;
      case 'warn':
        logtail.warn(systemMessage);
        break;
      default:
        logtail.info(systemMessage);
    }
  }

  // Método para resetar suppressões (útil para testes)
  static resetSuppressions(): void {
    this.rateLimitMessages.clear();
  }
} 