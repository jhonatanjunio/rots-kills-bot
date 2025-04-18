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
  private static readonly MAX_FETCH_RETRIES = 3;
  private static readonly API_URL = config.game.apiUrl;
  private static readonly SERVER = config.game.server;
  private static readonly BROWSER_CACHE_TTL = 30 * 60 * 1000; // 30 minutos
  private static browserLastUsed: number = 0;
  private static readonly PUPPETEER_TIMEOUT = 120000; // 2 minutos para Puppeteer

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

  private static async fetchWithRetry(url: string, options: any): Promise<any> {
    for (let i = 0; i < this.MAX_FETCH_RETRIES; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          agent: this.cookieManager.getAgent(),
          timeout: 15000
        });
        
        if (response.status === 429) {
          logtail.warn(`Erro 429 (Too Many Requests) recebido ao tentar: ${url}`);
          this.cookieManager.registerRateLimitError();
          
          const backoffTime = Math.pow(2, i + 2) * 2000; // Backoff exponencial maior: 8s, 16s, 32s
          logtail.info(`Aguardando ${backoffTime/1000}s antes de nova tentativa`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        } else if (response.status === 403) {
          logtail.error(`Erro 403 (Forbidden) recebido ao tentar: ${url}`);
          return null; // Retorna null para indicar que devemos mudar para o modo browser
        }
        
        if (!response.ok) {
          logtail.error(`Erro na requisição: ${response.status} ${response.statusText}`);
          return null;
        }
        
        return response;
      } catch (error) {
        logtail.error(`Tentativa ${i + 1} falhou: ${error}`);
        if (i === this.MAX_FETCH_RETRIES - 1) return null;
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
    logtail.error('Todas as tentativas falharam');
    return null;
  }

  private static async fetchPlayerData(playerId: number): Promise<PlayerDataResponse> {
    try {
      const endpoint = `/profile/${playerId}`;
      await this.cookieManager.waitForCooldown(endpoint);

      const headers = await this.getHeaders();
      const url = `${this.API_URL}${endpoint}?server=${this.SERVER}`;
      
      const response = await this.fetchWithRetry(url, { 
        headers,
        agent: this.cookieManager.getAgent()
      });

      // Se o fetch falhar, retornamos erro
      if (!response) {
        return { error: true, message: 'Erro na requisição HTTP', method: 'fetch' };
      }

      // Extrai cookies da resposta
      await this.cookieManager.extractCookiesFromResponse(response.headers);

      let responseText = '';
      try {
        responseText = await response.text();
        const data = JSON.parse(responseText);
        return { error: false, data, method: 'fetch' };
      } catch (error) {
        logtail.error(`Erro ao processar resposta JSON: ${error}`);
        logtail.error(`Resposta recebida: ${responseText.substring(0, 200)}...`);
        return { error: true, message: `Erro ao parsear resposta da API: ${error}`, method: 'fetch' };
      }
    } catch (error) {
      logtail.error(`Erro ao buscar dados via fetch: ${error}`);
      return { error: true, message: `Erro ao buscar dados: ${error}`, method: 'fetch' };
    }
  }

  static async initialize() {
    if (!this.browser) {
      try {
        this.browser = await ChromeService.launchBrowser();
        this.browserLastUsed = Date.now();
        logtail.info('Browser inicializado com sucesso');
      } catch (error) {
        logtail.error(`Erro ao inicializar o browser: ${error}`);
      }
    } else {
      // Verifica se o browser está ocioso por muito tempo e precisa ser reiniciado
      const now = Date.now();
      if (now - this.browserLastUsed > this.BROWSER_CACHE_TTL) {
        try {
          await this.browser.close();
          this.browser = await ChromeService.launchBrowser();
          logtail.info('Browser reiniciado após período de inatividade');
        } catch (error) {
          logtail.error(`Erro ao reiniciar o browser: ${error}`);
        }
      }
      this.browserLastUsed = now;
    }
    return this.browser;
  }

  static async getPlayerData(playerId: number): Promise<PlayerDataResponse> {
    // Vamos pular completamente o método fetch e usar apenas o Puppeteer
    return this.getPuppeteerPlayerData(playerId);

    /* 
    // Desativado o método de fetch para evitar problemas de rate limiting
    const currentFailures = this.fetchFailures.get(playerId) || 0;
    
    // Se já atingiu o limite de falhas, vai direto para Puppeteer
    if (currentFailures >= this.MAX_FETCH_FAILURES) {
      logtail.info(`Usando Puppeteer para player ${playerId} após ${currentFailures} falhas`);
      return this.getPuppeteerPlayerData(playerId);
    }

    try {
      // Tenta com fetch
      const fetchResult = await this.fetchPlayerData(playerId);
      
      if (fetchResult.error) {
        const newFailures = currentFailures + 1;
        this.fetchFailures.set(playerId, newFailures);
        logtail.warn(`Falha ${newFailures}/${this.MAX_FETCH_FAILURES} para player ${playerId}`);

        if (newFailures >= this.MAX_FETCH_FAILURES) {
          logtail.info(`Mudando para Puppeteer após ${newFailures} falhas para player ${playerId}`);
          return this.getPuppeteerPlayerData(playerId);
        }
      } else {
        // Limpa o contador em caso de sucesso
        this.fetchFailures.delete(playerId);
      }

      return fetchResult;
    } catch (error) {
      // Garante que o contador seja incrementado mesmo em caso de erro não tratado
      const newFailures = currentFailures + 1;
      this.fetchFailures.set(playerId, newFailures);
      
      if (newFailures >= this.MAX_FETCH_FAILURES) {
        return this.getPuppeteerPlayerData(playerId);
      }
      
      return { error: true, message: `Erro ao buscar dados: ${error}`, method: 'fetch' };
    }
    */
  }

  public static async getPuppeteerPlayerData(playerId: number): Promise<PlayerDataResponse> {
    try {
      const browser = await this.initialize();
      if (!browser) {
        return { error: true, message: 'Falha ao inicializar o navegador', method: 'browser' };
      }
      
      let page;
      try {
        page = await browser.newPage();
      } catch (error) {
        logtail.error(`Erro ao criar nova página: ${error}`);
        // Tenta reiniciar o browser
        await this.browser.close();
        this.browser = await ChromeService.launchBrowser();
        page = await this.browser.newPage();
      }

      await page.setDefaultNavigationTimeout(this.PUPPETEER_TIMEOUT);
      await page.setDefaultTimeout(this.PUPPETEER_TIMEOUT);
      
      // Configurações adicionais para o navegador parecer mais humano
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      });
      
      await page.setRequestInterception(true);
      let responseData: PlayerDataResponse | null = null;

      page.on('request', (request: any) => {
        // Bloquear recursos desnecessários para melhorar performance
        const resourceType = request.resourceType();
        if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
          request.abort();
        } else {
          request.continue();
        }
      });

      page.on('response', async (response: any) => {
        if (response.url().includes('/profile/')) {
          try {
            const responseText = await response.text();
            if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
              // É uma resposta HTML, provavelmente um erro ou página de bloqueio
              logtail.warn(`Resposta HTML recebida - possível bloqueio de Cloudflare`);
              responseData = { error: true, message: 'Erro: Resposta HTML recebida em vez de JSON', method: 'browser' };
              return;
            }
            
            const data = JSON.parse(responseText);
            responseData = { error: false, data, method: 'browser' };
          } catch (e) {
            logtail.error(`Erro ao parsear resposta: ${e}`);
            responseData = { error: true, message: 'Erro ao parsear resposta da API', method: 'browser' };
          }
        }
      });

      // Aumenta o timeout para dar mais tempo para carregar
      logtail.info(`Navegando para perfil do jogador ${playerId}`);
      await page.goto(`${this.API_URL}/profile/${playerId}?server=${this.SERVER}`, {
        waitUntil: 'networkidle2',
        timeout: this.PUPPETEER_TIMEOUT
      });

      let attempts = 0;
      const maxAttempts = 30; // Aumenta o número de tentativas
      const attemptDelay = 1000; // ms entre checagens 
      
      while (!responseData && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, attemptDelay));
        attempts++;
        
        if (attempts % 10 === 0) {
          logtail.info(`Aguardando resposta da API... Tentativa ${attempts}/${maxAttempts}`);
        }
      }

      this.browserLastUsed = Date.now();
      await page.close().catch((error: Error) => logtail.error(`Erro ao fechar página: ${error}`));

      if (!responseData) {
        return { error: true, message: 'Timeout ao aguardar dados do jogador', method: 'browser' };
      }

      return responseData;
    } catch (error) {
      logtail.error(`Erro ao buscar dados via browser: ${error}`);
      
      // Tenta reiniciar o browser em caso de erro
      try {
        if (this.browser) {
          await this.browser.close().catch(() => {});
        }
        this.browser = await ChromeService.launchBrowser();
        logtail.info('Browser reiniciado após erro');
      } catch (e) {
        logtail.error(`Erro ao reiniciar browser: ${e}`);
      }
      
      return { error: true, message: `Erro ao buscar dados: ${error}`, method: 'browser' };
    }
  }
}
