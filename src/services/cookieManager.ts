import { ChromeService } from './chromeService';
import https from 'https';
import { logtail } from '../utils/logtail';
import config from '../config';

interface CloudflareCookie {
  value: string;
  timestamp: number;
  expiresAt: number;
}

interface RequestMetadata {
  lastRequestTime: number;
  requestCount: number;
}

export class CookieManager {
  private static instance: CookieManager;
  private cookie: CloudflareCookie | null = null;
  private isRefreshing = false;
  private requestMetadata: Map<string, RequestMetadata> = new Map();
  
  private readonly COOKIE_REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutos
  private readonly REQUEST_COOLDOWN = 1000; // Aumentado para 1000ms (1 segundo)
  private readonly MAX_REQUESTS_PER_MINUTE = 20; // Reduzido de 30 para 20
  private readonly BACKOFF_MULTIPLIER = 1.5; // Fator para backoff exponencial
  private readonly MAX_BACKOFF = 60000; // Backoff máximo de 1 minuto
  private rateErrorTimestamps: number[] = []; // Armazena timestamps dos erros 429
  private rateLimitBackoff = 0; // Tempo adicional de espera após erros 429
  private readonly agent = new https.Agent({
    rejectUnauthorized: false
  });

  private constructor() {
    setInterval(() => this.refreshCookie(), this.COOKIE_REFRESH_INTERVAL);
  }

  public static getInstance(): CookieManager {
    if (!CookieManager.instance) {
      CookieManager.instance = new CookieManager();
    }
    return CookieManager.instance;
  }

  public getAgent(): https.Agent {
    return this.agent;
  }

  public async extractCookiesFromResponse(headers: any): Promise<void> {
    const setCookieHeader = headers.get('set-cookie');
    if (setCookieHeader) {
      const cfCookie = setCookieHeader.find((cookie: string) => cookie.includes('cf_clearance'));
      if (cfCookie) {
        const match = cfCookie.match(/cf_clearance=([^;]+)/);
        if (match) {
          this.cookie = {
            value: match[1],
            timestamp: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 horas
          };
          console.log('✅ Cookie do Cloudflare atualizado via resposta HTTP');
        }
      }
    }
  }

  public async waitForCooldown(endpoint: string): Promise<void> {
    const metadata = this.requestMetadata.get(endpoint) || {
      lastRequestTime: 0,
      requestCount: 0
    };

    const now = Date.now();
    const timeSinceLastRequest = now - metadata.lastRequestTime;

    // Aplica backoff baseado em erros recentes de rate limit
    this.updateRateLimitBackoff();
    
    // Reseta o contador se passou mais de um minuto
    if (timeSinceLastRequest > 60000) {
      metadata.requestCount = 0;
    }

    // Verifica se excedeu o limite de requisições por minuto
    if (metadata.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - timeSinceLastRequest + this.rateLimitBackoff;
      if (waitTime > 0) {
        console.log(`Aguardando ${waitTime/1000}s para evitar rate limit`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      metadata.requestCount = 0;
    }

    // Aplica o cooldown entre requisições (com backoff se necessário)
    const effectiveCooldown = this.REQUEST_COOLDOWN + this.rateLimitBackoff;
    if (timeSinceLastRequest < effectiveCooldown) {
      await new Promise(resolve => 
        setTimeout(resolve, effectiveCooldown - timeSinceLastRequest)
      );
    }

    metadata.lastRequestTime = Date.now();
    metadata.requestCount++;
    this.requestMetadata.set(endpoint, metadata);
  }

  // Registra um erro 429 para ajustar o backoff
  public registerRateLimitError(): void {
    this.rateErrorTimestamps.push(Date.now());
    
    // Aumenta o backoff exponencialmente a cada erro 429
    this.rateLimitBackoff = Math.min(
      this.rateLimitBackoff === 0 ? 2000 : this.rateLimitBackoff * this.BACKOFF_MULTIPLIER,
      this.MAX_BACKOFF
    );
    
    logtail.warn(`Rate limit atingido. Backoff ajustado para ${this.rateLimitBackoff}ms`);
  }

  // Atualiza o backoff com base nos erros recentes
  private updateRateLimitBackoff(): void {
    const now = Date.now();
    
    // Remove erros antigos (mais de 5 minutos)
    this.rateErrorTimestamps = this.rateErrorTimestamps.filter(
      timestamp => now - timestamp < 5 * 60 * 1000
    );
    
    // Se não houver erros recentes, reduz o backoff gradualmente
    if (this.rateErrorTimestamps.length === 0 && this.rateLimitBackoff > 0) {
      this.rateLimitBackoff = Math.max(0, this.rateLimitBackoff - 500); // Reduz 500ms a cada chamada
    }
  }

  public async getCookie(): Promise<string | null> {
    if (!this.cookie) {
      await this.refreshCookie();
    } else if (this.isExpired()) {
      await this.refreshCookie();
    }
    return this.cookie?.value || null;
  }

  private isExpired(): boolean {
    if (!this.cookie) return true;
    const now = Date.now();
    return now >= this.cookie.expiresAt;
  }

  private async refreshCookie(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    let browser = null;

    try {
      browser = await ChromeService.launchBrowser();
      
      const page = await browser.newPage();
      await page.goto(`${config.game.apiUrl}/profile/1?server=${config.game.server}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const cookies = await page.cookies();
      const cfCookie = cookies.find(c => c.name === 'cf_clearance');

      if (cfCookie) {
        this.cookie = {
          value: cfCookie.value,
          timestamp: Date.now(),
          expiresAt: Date.now() + (cfCookie.expires * 1000)
        };
        
        console.log('✅ Cookie do Cloudflare atualizado com sucesso');
        logtail.info('Cookie do Cloudflare atualizado com sucesso');
      }

    } catch (error) {
      console.error('❌ Erro ao atualizar cookie:', error);
      logtail.error(`Erro ao atualizar cookie: ${error}`);
      this.cookie = null;
    } finally {
      if (browser) {
        await browser.close();
      }
      this.isRefreshing = false;
    }
  }
}
