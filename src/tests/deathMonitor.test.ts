import { DeathMonitor } from '../services/deathMonitor';
import { Database } from '../services/database';
import { Client } from 'discord.js';
import { Player } from '../models/Player';

describe('DeathMonitor', () => {
  let monitor: DeathMonitor;
  let mockClient: Client;

  beforeEach(async () => {
    // Limpa o banco de dados antes de cada teste
    await Database.load();
    
    mockClient = new Client({ intents: [] });
    monitor = DeathMonitor.initialize(mockClient);
  });

  afterEach(() => {
    monitor.stop();
  });

  it('should detect new deaths', async () => {
    // Arrange
    const player: Player = {
      id: 97866,
      name: "Only Damage",
      level: 174,
      vocation: 3,
      isAlly: true
    };
    await Database.addPlayer(player);

    // Act
    await monitor.start();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Assert
    const deathLogs = await Database.getPlayerDeathLogs("Only Damage");
    expect(deathLogs.length).toBeGreaterThan(0);
  });
}); 