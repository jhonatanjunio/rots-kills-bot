import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import puppeteer from 'puppeteer-extra';

export interface PlayerDataResponse {
  error: boolean;
  message?: string;
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

  static async initialize() {
    if (!this.browser) {
      // Adiciona o plugin stealth
      puppeteer.use(StealthPlugin());

      const browser = await puppeteer.launch({
        headless: true,
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
    }
    return this.browser;
  }

  static async getPlayerData(playerId: number): Promise<PlayerDataResponse> {
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
            responseData = { error: false, data };
          } catch (e) {
            console.log('Erro ao parsear resposta:', e);
            responseData = { error: true, message: 'Erro ao parsear resposta da API' };
          }
        }
      });

      await page.goto(`https://api.saiyansreturn.com/profile/${playerId}?server=Universe%20Supreme`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      let attempts = 0;
      while (!responseData && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      if (!responseData) {
        return { error: true, message: 'Timeout ao aguardar dados do jogador' };
      }

      await page.close();

      return responseData;
    } catch (error) {
      console.error('Erro ao buscar dados via browser:', error);
      return { error: true, message: `Erro ao buscar dados: ${error}` };
    }
  }
}
