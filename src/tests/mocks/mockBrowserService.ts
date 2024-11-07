import { PlayerDataResponse } from '../../services/browserService';
import { readFileSync } from 'fs';
import path from 'path';

export class MockBrowserService {
    private static mockDataPath = path.join(process.cwd(), 'src', 'tests', 'data', 'mock_deaths.json');

    static async getPlayerData(playerId: string): Promise<PlayerDataResponse> {
        try {
            const content = readFileSync(this.mockDataPath, 'utf-8');
            const data = JSON.parse(content);
            return { error: false, data };
        } catch (error) {
            console.error('Erro ao ler mock data:', error);
            return { error: true, message: `Erro ao buscar dados: ${error}` };
        }
    }
} 