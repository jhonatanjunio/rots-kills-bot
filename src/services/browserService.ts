import { logtail } from '../utils/logtail';
import config from '../config';
import fetch from 'node-fetch';
import { CookieManager } from './cookieManager';
import { ChromeService } from './chromeService';

export interface PlayerDataResponse {
  error: boolean;
  message?: string;
  method?: 'fetch' | 'browser';
  data?: {
    id: number;
    name: string;
    level: number;
    vocation: {
      id: number;
      name: string;
    };
    deaths?: {
      deaths: Array<{
        is_player: number;
        mostdamage_is_player: number;
        killed_by: string;
        mostdamage_by: string;
        time: number;
        level: number;
      }>;
    };
  };
}

export class BrowserService {
  private static browser: any | null = null;
  private static cookieManager = CookieManager.getInstance();
  private static fetchFailures = new Map<number, number>();
  private static readonly MAX_FETCH_FAILURES = 3;
  private static readonly API_URL = config.game.apiUrl;

  private static async getHeaders(): Promise<Record<string, string>> {
    const cfCookie = await this.cookieManager.getCookie();
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Host': 'api.saiyansreturn.com',
      'Connection': 'keep-alive',
      ...(cfCookie ? { 'Cookie': `cf_clearance=${cfCookie}` } : {}),
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };
  }

  private static async fetchWithRetry(url: string, options: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          agent: this.cookieManager.getAgent(),
          timeout: 10000 // 10 segundos timeout
        });
        return response;
      } catch (error) {
        console.error(`Tentativa ${i + 1} falhou:`, error);
        logtail.error(`Tentativa ${i + 1} falhou: ${error}`);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Espera crescente entre tentativas
      }
    }
    throw new Error('Todas as tentativas falharam');
  }

  private static async fetchPlayerData(playerId: number): Promise<PlayerDataResponse> {
    try {
      const endpoint = `/profile/${playerId}`;
      await this.cookieManager.waitForCooldown(endpoint);

      const headers = await this.getHeaders();
      const url = `${this.API_URL}${endpoint}?server=Universe%20Supreme`;
      
      const response = await this.fetchWithRetry(url, { 
        headers,
        agent: this.cookieManager.getAgent()
      });

      // Extrai cookies da resposta
      await this.cookieManager.extractCookiesFromResponse(response.headers);

      if (!response.ok) {
        const failures = (this.fetchFailures.get(playerId) || 0) + 1;
        this.fetchFailures.set(playerId, failures);
        
        throw new Error(`Erro na requisição: ${response.status}`);
      }

      this.fetchFailures.delete(playerId);
      
      const data: any = await response.json();
      return { error: false, data, method: 'fetch' };
    } catch (error) {
      console.error('Erro ao buscar dados via fetch:', error);
      return { error: true, message: `Erro ao buscar dados: ${error}`, method: 'fetch' };
    }
  }

  static async initialize() {
    if (!this.browser) {
      try {
        this.browser = await ChromeService.launchBrowser();
      } catch (error) {
        console.error('❌ Erro ao inicializar o browser:', error);
        logtail.error(`Erro ao inicializar o browser: ${error}`);
        throw error;
      }
    }
    return this.browser;
  }

  static async getPlayerData(playerId: number): Promise<PlayerDataResponse> {
    // Verifica se deve usar Puppeteer baseado no histórico de falhas
    const shouldUsePuppeteer = (this.fetchFailures.get(playerId) || 0) >= this.MAX_FETCH_FAILURES;

    if (!shouldUsePuppeteer) {
      // Tenta primeiro com fetch
      const fetchResult = await this.fetchPlayerData(playerId);
      if (!fetchResult.error) {
        return fetchResult;
      }
    }

    // Fallback para Puppeteer
    console.log('Usando Puppeteer como fallback...');
    return this.getPuppeteerPlayerData(playerId);
  }

  private static async getPuppeteerPlayerData(playerId: number): Promise<PlayerDataResponse> {
    try {
      const browser = await this.initialize();
      const page = await browser.newPage();
      
      await page.setRequestInterception(true);
      let responseData: PlayerDataResponse | null = null;

      page.on('request', (request: any) => {
        request.continue();
      });

      page.on('response', async (response: any) => {
        if (response.url().includes('/profile/')) {
          try {
            const data = await response.json();
            responseData = { error: false, data, method: 'browser' };
          } catch (e) {
            console.log('Erro ao parsear resposta:', e);
            responseData = { error: true, message: 'Erro ao parsear resposta da API', method: 'browser' };
            logtail.error(`Erro ao parsear resposta: ${e}`);
          }
        }
      });

      await page.goto(`${this.API_URL}/profile/${playerId}?server=Universe%20Supreme`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      let attempts = 0;
      while (!responseData && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      await page.close();

      if (!responseData) {
        return { error: true, message: 'Timeout ao aguardar dados do jogador', method: 'browser' };
      }

      return responseData;
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      logtail.error(`Erro ao buscar dados: ${error}`);
      return { error: true, message: `Erro ao buscar dados: ${error}`, method: 'browser' };
    }
  }
}
