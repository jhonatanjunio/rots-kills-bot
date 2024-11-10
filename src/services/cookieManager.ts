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
  private readonly REQUEST_COOLDOWN = 500; // 500ms entre requisições
  private readonly MAX_REQUESTS_PER_MINUTE = 30;
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

    // Reseta o contador se passou mais de um minuto
    if (timeSinceLastRequest > 60000) {
      metadata.requestCount = 0;
    }

    // Verifica se excedeu o limite de requisições por minuto
    if (metadata.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - timeSinceLastRequest;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      metadata.requestCount = 0;
    }

    // Aplica o cooldown entre requisições
    if (timeSinceLastRequest < this.REQUEST_COOLDOWN) {
      await new Promise(resolve => 
        setTimeout(resolve, this.REQUEST_COOLDOWN - timeSinceLastRequest)
      );
    }

    metadata.lastRequestTime = Date.now();
    metadata.requestCount++;
    this.requestMetadata.set(endpoint, metadata);
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
      await page.goto(`${config.game.apiUrl}/profile/1?server=Universe%20Supreme`, {
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
