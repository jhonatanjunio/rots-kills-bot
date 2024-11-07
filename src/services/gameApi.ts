import fetch from 'node-fetch';
import config from '../config/config.json';
import { Database } from './database';
import { Player } from '../models/Player';
import { BrowserService } from './browserService';

export class GameAPI {
    private static headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    static async createPlayer(playerName: string, isAlly: boolean) {
        try {
            const response = await fetch(
                `${config.game.apiUrl}/characters?server=Universe%20Supreme&name=${playerName}&limit=5`,
                { headers: this.headers }
            );
            const characters = await response.json();
            const playerData = characters.find((character: any) => character.name === playerName);
            
            if (!playerData || !playerData.id) {
                console.error('Jogador não encontrado');
                throw new Error('Jogador não encontrado');
            }

            const getDeaths = await BrowserService.getPlayerData(playerData.id);            
            
            if (getDeaths.error || !getDeaths.data) {
                console.error(getDeaths.message || 'Erro ao buscar dados do jogador');
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
                const deaths = data.deaths.deaths
                    .filter((death: any) => death.is_player === 1)
                    .map((death: any) => ({
                        playerName: playerName,
                        killed_by: death.killed_by,
                        mostdamage_by: death.mostdamage_by,
                        timestamp: death.time,
                        level: death.level
                    }));

                for (const death of deaths) {
                    await Database.addDeathLog(death);
                }
            }
            
            return data;
        } catch (error) {
            console.error('Erro ao criar jogador:', error);
            throw error;
        }
    }

    static async updatePlayer(player: Player) {
        try {
            const playerData = await BrowserService.getPlayerData(player.id);
            
            if (playerData.error || !playerData.data) {
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
                    .filter((death: any) => death.is_player === 1)
                    .map((death: any) => ({
                        playerName: player.name,
                        killed_by: death.killed_by,
                        mostdamage_by: death.mostdamage_by,
                        timestamp: death.time,
                        level: death.level
                    }));
                
                // if (deaths.length > 0) {
                //     console.info('💀 Mortes por jogadores encontradas:', deaths);
                //     await this.addDeathLogs(player.name, deaths);
                // }
            }

            return { 
                player: updatePlayerData, 
                deaths: recentDeaths,
                error: false 
            };
        } catch (error) {
            console.error(`Erro ao atualizar dados do jogador ${player.name}:`, error);
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
                console.log('Ambiente de teste - buscando dados mock');
                const { MockBrowserService } = require('../tests/mocks/mockBrowserService');
                const response = await MockBrowserService.getPlayerData('test');
                console.log('Dados mock obtidos:', response.data);
                
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
            // console.info(getPlayerData);

            if (getPlayerData && getPlayerData.id) {
                const { player, deaths } = await this.updatePlayer(getPlayerData);
                // console.info(deaths);
                return { player, deaths };
            } else {
                console.error(`Membro ${playerName} não encontrado no banco de dados. Você precisa adicionar o jogador primeiro com o comando /addplayer`);
                return {
                    error: true,
                    message: `Membro ${playerName} não encontrado no banco de dados. Você precisa adicionar o jogador primeiro com o comando /addplayer`
                }
            }
        } catch (error) {
            console.error('Erro em getPlayerInfo:', error);
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
            console.error(`Erro ao buscar mortes do jogador ${player.name}:`, error);
            return {
                error: true,
                message: `Erro ao buscar mortes do jogador ${player.name}: ${error}`
            }
        }
    }

    static async addDeathLogs(playerName: string, deaths: any[]) {
        for (const death of deaths) {
            if (death.is_player != 1) continue;

            const deathLog = {
                playerName,
                killed_by: death.killed_by,
                mostdamage_by: death.mostdamage_by,
                timestamp: death.time,
                level: death.level
            };

            await Database.addDeathLog(deathLog);
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
}
