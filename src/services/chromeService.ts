import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import { logtail } from '../utils/logtail';

export class ChromeService {
  static getChromePath(): string {
    const isExecutable = process.execPath.endsWith('.exe');
    const baseDir = isExecutable ? path.dirname(process.execPath) : process.cwd();
    return path.join(baseDir, '.local-chromium', 'chrome.exe');
  }

  static async launchBrowser() {
    const chromePath = this.getChromePath();
    logtail.info(`Iniciando Chrome em: ${chromePath}`);

    puppeteer.use(StealthPlugin());
    return await puppeteer.launch({
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
  }
}
