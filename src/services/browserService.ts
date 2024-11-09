import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteer from 'puppeteer-extra';
import path from 'path';
import { logtail } from '../utils/logtail';

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
  private static readonly API_URL = 'https://api.saiyansreturn.com';

  private static async fetchPlayerData(playerId: number): Promise<PlayerDataResponse> {
    try {
      const response = await fetch(
        `${this.API_URL}/profile/${playerId}?server=Universe%20Supreme`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
      }

      const data: any = await response.json();
      return { error: false, data, method: 'fetch' };
    } catch (error) {
      console.error('Erro ao buscar dados via fetch:', error);
      logtail.error(`Erro ao buscar dados: ${error}`);
      return { error: true, message: `Erro ao buscar dados: ${error}`, method: 'fetch' };
    }
  }

  static async initialize() {
    if (!this.browser) {
      puppeteer.use(StealthPlugin());

      // Define o caminho do Chrome para Windows
      const chromePath = path.join(process.cwd(), '.local-chromium', 'chrome.exe');

      try {
        const browser = await puppeteer.launch({
          headless: true,
          executablePath: chromePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
          ],
        });

        this.browser = browser;
      } catch (error) {
        console.error('Erro ao inicializar o browser:', error);
        logtail.error(`Erro ao inicializar o browser: ${error}`);
        throw error;
      }
    }
    return this.browser;
  }

  static async getPlayerData(playerId: number): Promise<PlayerDataResponse> {
    try {
      // Tenta primeiro com fetch
      const fetchResult = await this.fetchPlayerData(playerId);
      if (fetchResult && !fetchResult.error) {
        return fetchResult;
      }

      // Se falhar, usa o puppeteer como fallback
      console.log('Fetch falhou, usando browser como fallback...');
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
