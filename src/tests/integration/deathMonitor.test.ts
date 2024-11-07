import { DeathMonitor } from '../../services/deathMonitor';
import { Database } from '../../services/database';
import { Client, TextChannel } from 'discord.js';
import { writeFileSync } from 'fs';
import path from 'path';

// Define ambiente de teste
process.env.NODE_ENV = 'test';

describe('DeathMonitor Integration Test', () => {
    let monitor: DeathMonitor;
    let mockClient: Client;
    const mockDeathsPath = path.join(process.cwd(), 'src', 'tests', 'data', 'mock_deaths.json');
    
    beforeEach(async () => {
        console.log('Iniciando teste...');
        
        // Limpa o banco de dados
        await Database.load();
        const allLogs = await Database.getAllDeathLogs();
        console.log('Logs iniciais:', allLogs.length);

        // Setup do mock do Discord
        const mockChannel = {
            send: jest.fn().mockImplementation((message) => {
                console.log('Mensagem enviada:', message);
                return Promise.resolve(true);
            })
        } as unknown as TextChannel;

        mockClient = {
            channels: {
                cache: new Map().set('mock-channel', mockChannel)
            }
        } as unknown as Client;

        // Adiciona jogador para teste
        const player = {
            id: 175606,
            name: "TestPlayer",
            level: 281,
            vocation: 2,
            isAlly: true
        };
        await Database.addPlayer(player);
        console.log('Jogador adicionado:', player);

        // Reset do arquivo de mock
        const initialData = {
            id: 175606,
            name: "TestPlayer",
            level: 281,
            vocation: {
                id: 2,
                name: "Vegeta"
            },
            deaths: {
                deaths: []
            }
        };
        writeFileSync(mockDeathsPath, JSON.stringify(initialData, null, 2));
        console.log('Arquivo de mock resetado');

        // Inicializa o monitor
        monitor = DeathMonitor.initialize(mockClient);
        await monitor.start();
        console.log('Monitor iniciado');
    });

    afterEach(async () => {
        monitor.stop();
        console.log('Monitor parado');
    });

    it('should detect new death when file is updated', async () => {
        console.log('Iniciando teste de detecção de morte...');

        // Simula uma nova morte
        const newDeathData = {
            id: 175606,
            name: "TestPlayer",
            level: 281,
            vocation: {
                id: 2,
                name: "Vegeta"
            },
            deaths: {
                deaths: [{
                    time: Math.floor(Date.now() / 1000),
                    level: 281,
                    killed_by: "TestKiller",
                    is_player: 1,
                    mostdamage_by: "TestKiller",
                    mostdamage_is_player: 1
                }]
            }
        };

        // Atualiza o arquivo
        writeFileSync(mockDeathsPath, JSON.stringify(newDeathData, null, 2));
        console.log('Arquivo de mock atualizado com nova morte');

        // Força uma verificação imediata e aguarda
        await monitor['checkBatch']();
        console.log('Primeira verificação executada');
        
        // Aguarda um pouco mais
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Força outra verificação
        await monitor['checkBatch']();
        console.log('Segunda verificação executada');

        // Aguarda o processamento
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verifica se a morte foi registrada
        const deathLogs = await Database.getAllDeathLogs();
        console.log('Logs após teste:', deathLogs);
        
        expect(deathLogs.length).toBeGreaterThan(0);
        if (deathLogs.length > 0) {
            expect(deathLogs[0].killed_by).toBe('TestKiller');
        }
    }, 20000);
}); 