import fetch from 'node-fetch';
import config from '../config';
import { Database } from './database';
import { Player } from '../models/Player';
import { BrowserService } from './browserService';
import { isFromToday } from '../utils/formatters';
import { logtail } from '../utils/logtail';
import { CookieManager } from './cookieManager';

export class GameAPI {
    private static headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    private static async fetchWithRetry(url: string, options: any, retries = 3): Promise<any> {
        const endpoint = new URL(url).pathname;
        const cookieManager = CookieManager.getInstance();
        
        for (let i = 0; i < retries; i++) {
            await cookieManager.waitForCooldown(endpoint);
            
            try {
                const response = await fetch(url, {
                    ...options,
                    agent: cookieManager.getAgent(),
                    timeout: 10000
                });

                // Trata erros 429 especificamente
                if (response.status === 429) {
                    logtail.warn(`Erro 429 (Too Many Requests) recebido ao tentar: ${url}`);
                    cookieManager.registerRateLimitError();
                    
                    // Espera mais tempo antes de tentar novamente
                    const backoffTime = Math.pow(2, i + 1) * 2000; // Backoff exponencial: 4s, 8s, 16s
                    logtail.info(`Aguardando ${backoffTime/1000}s antes de nova tentativa`);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    continue;
                }

                // Verifica se a resposta foi bem-sucedida
                if (!response.ok) {
                    throw new Error(`Erro na requisição: ${response.status}`);
                }

                // Extrai cookies da resposta
                await cookieManager.extractCookiesFromResponse(response.headers);
                
                return response;
            } catch (error) {
                logtail.error(`Tentativa ${i + 1} falhou: ${error}`);
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
        throw new Error('Todas as tentativas falharam');
    }

    static async createPlayer(playerName: string, isAlly: boolean) {
        try {
            const url = `${config.game.apiUrl}/characters?server=${config.game.server}&name=${playerName}&limit=5`;
            logtail.info(`Buscando jogador: ${playerName}`);
            
            const response = await this.fetchWithRetry(url, { headers: this.headers });
            
            if (!response.ok) {
                logtail.error(`Erro na resposta da API: ${response.status} ${response.statusText}`);
                throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
            }

            const responseText = await response.text();
            
            let characters;
            try {
                characters = JSON.parse(responseText);
            } catch (e) {
                logtail.error(`Erro ao parsear JSON: ${e}`);
                throw new Error('Resposta inválida da API');
            }

            if (!Array.isArray(characters)) {
                logtail.error(`Resposta não é um array: ${JSON.stringify(characters).substring(0, 100)}...`);
                throw new Error('Formato de resposta inválido');
            }

            const playerData = characters.find((character: any) => character.name === playerName);
            
            if (!playerData || !playerData.id) {
                logtail.error(`Jogador não encontrado nos dados`);
                throw new Error('Jogador não encontrado');
            }

            const getDeaths = await BrowserService.getPlayerData(playerData.id);            
            
            if (getDeaths.error || !getDeaths.data) {
                logtail.error(`Erro ao buscar dados do jogador: ${getDeaths.message}`);
                throw new Error(getDeaths.message || 'Erro ao buscar dados do jogador');
            }

            const data = getDeaths.data;
            await Database.addPlayer({
                id: data.id,
                name: playerName,
                level: data.level,
                vocation: data.vocation.id,
                isAlly: isAlly
            });

            if (data.deaths && data.deaths.deaths?.length > 0) {
                for (const death of data.deaths.deaths) {
                    const deathLog = {
                        playerName: playerName,
                        killed_by: death.killed_by,
                        mostdamage_by: death.mostdamage_by,
                        timestamp: death.time,
                        level: death.level
                    };

                    if (death.is_player === 1 || death.mostdamage_is_player === 1) {
                        await Database.addPlayerDeathLog(deathLog);
                    } else if (isFromToday(death.time)) {
                        await Database.addMonsterDeathLog(deathLog);
                    }
                }
            }
            
            logtail.info(`Jogador criado com sucesso: ${playerName} (ID: ${data.id})`);
            return data;
        } catch (error) {
            logtail.error(`Erro ao criar jogador: ${error}`);
            throw error;
        }
    }

    static async updatePlayer(player: Player) {
        try {
            const playerData = await BrowserService.getPlayerData(player.id);
            
            if (playerData.error || !playerData.data) {
                logtail.error(`Erro ao buscar dados do jogador: ${playerData.message}`);
                throw new Error(playerData.message || 'Erro ao buscar dados do jogador');
            }

            const data = playerData.data;
            const updatePlayerData: Player = {
                id: data.id,
                name: data.name,
                level: data.level,
                vocation: data.vocation.id,
                isAlly: player.isAlly
            }
            
            await Database.updatePlayer(updatePlayerData);
            const recentDeaths = data.deaths?.deaths;
            let deaths: any[] = [];
            
            if (recentDeaths && recentDeaths.length > 0) {
                deaths = recentDeaths
                    .filter((death: any) => death.is_player === 1 || death.mostdamage_is_player === 1)
                    .map((death: any) => ({
                        playerName: player.name,
                        killed_by: death.killed_by,
                        mostdamage_by: death.mostdamage_by,
                        timestamp: death.time,
                        level: death.level
                    }));
            }

            return { 
                player: updatePlayerData, 
                deaths: recentDeaths,
                error: false 
            };
        } catch (error) {
            logtail.error(`Erro ao atualizar dados do jogador ${player.name}: ${error}`);
            return {
                error: true,
                message: `Erro ao atualizar dados do jogador ${player.name}: ${error}`,
                player: null,
                deaths: []
            }
        }
    }

    static async getPlayerInfo(playerName: string) {
        try {
            if (process.env.NODE_ENV === 'test') {
                logtail.info('Ambiente de teste - buscando dados mock');
                const { MockBrowserService } = require('../tests/mocks/mockBrowserService');
                const response = await MockBrowserService.getPlayerData('test');
                
                return {
                    player: {
                        id: response.data.id,
                        name: response.data.name,
                        level: response.data.level,
                        vocation: response.data.vocation.id
                    },
                    deaths: response.data.deaths.deaths,
                    error: false
                };
            }

            let getPlayerData = await Database.getPlayer(playerName);

            if (getPlayerData && getPlayerData.id) {
                const { player, deaths } = await this.updatePlayer(getPlayerData);
                return { player, deaths };
            } else {
                logtail.error(`Membro ${playerName} não encontrado no banco de dados. Você precisa adicionar o jogador primeiro com o comando /addplayer`);
                return {
                    error: true,
                    message: `Membro ${playerName} não encontrado no banco de dados. Você precisa adicionar o jogador primeiro com o comando /addplayer`
                }
            }
        } catch (error) {
            logtail.error(`Erro em getPlayerInfo: ${error}`);
            return { error: true, message: String(error), player: null, deaths: [] };
        }
    }

    static async getPlayerDeaths(player: Player) {
        try {
            const { deaths } = await this.getPlayerInfo(player.name);
            return {
                error: false,
                data: deaths
            };
        } catch (error) {
            logtail.error(`Erro ao buscar mortes do jogador ${player.name}: ${error}`);
            return {
                error: true,
                message: `Erro ao buscar mortes do jogador ${player.name}: ${error}`
            }
        }
    }

    static async addDeathLogs(playerName: string, deaths: any[]) {
        for (const death of deaths) {
            const deathLog = {
                playerName,
                killed_by: death.killed_by,
                mostdamage_by: death.mostdamage_by,
                timestamp: death.time,
                level: death.level
            };

            if (death.is_player === 1 || death.mostdamage_is_player === 1) {
                await Database.addPlayerDeathLog(deathLog);
            } else {
                await Database.addMonsterDeathLog(deathLog);
            }
        }
    }

    static getAvatar(vocationId: number) {
        switch (vocationId) {
            case 1:
                //Goku
                return {
                    name: "Goku",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avataras.png"
                };
            case 2:
                //Vegeta
                return {
                    name: "Vegeta",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avatar-5.png"
                };
            case 3:
                //Gohan
                return {
                    name: "Gohan",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avatar-2.png"
                };
            case 4:
                //Trunks
                return {
                    name: "Trunks",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avatar-4.png"
                };
            case 5:
                //Piccolo
                return {
                    name: "Piccolo",
                    url: "https://saiyansreturn.com/images/characters/Piccolo/avatar.png"
                };
            case 6:
                //Dende
                return {
                    name: "Dende",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avatar-1.png"
                };
            case 7:
                //Buu
                return {
                    name: "Buu",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avatar.png"
                };
            case 8:
                //Bulma
                return {
                    name: "Bulma",
                    url: "https://www.saiyanspolska.pl/wp-content/uploads/2022/10/avatar-3.png"
                };
        }
    }

    static async searchPlayerById(playerId: number) {
        try {
            const response = await BrowserService.getPlayerData(playerId);
            
            if (response.error || !response.data) {
                logtail.error(`Erro ao buscar jogador por ID: ${response.message}`);
                return null;
            }

            return {
                id: response.data.id,
                name: response.data.name,
                level: response.data.level,
                vocation: response.data.vocation.id
            };
        } catch (error) {
            logtail.error(`Erro ao buscar jogador por ID: ${error}`);
            return null;
        }
    }
}
