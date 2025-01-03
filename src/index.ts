import { Client, GatewayIntentBits, IntentsBitField, Interaction, Options, Partials, ChatInputCommandInteraction } from 'discord.js';
import config from './config';
import { Database } from './services/database';
import { commands, CommandName, registerCommands } from './commands';
import { DeathMonitor } from './services/deathMonitor';
import { HealthMonitor } from './services/healthMonitor';
import { hasManagerRole } from './utils/permissions';
import { ShutdownManager } from './services/shutdownManager';
import { logtail } from './utils/logtail';
require('dotenv').config();

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,    
  ],
  partials: [Partials.Message, Partials.GuildMember, Partials.User, Partials.Channel],
  failIfNotExists: false,
  closeTimeout: 5000,
  shardCount: 1,
  makeCache: Options.cacheWithLimits({
    MessageManager: 200,
    PresenceManager: 200,
  }),
});

client.once('ready', async () => {
  console.log('Bot online!');
  await Database.ensureDatabaseFiles();
  await Database.load();
  await registerCommands(client);
  const deathMonitor = DeathMonitor.initialize(client);
  const healthMonitor = HealthMonitor.initialize(deathMonitor);
  await deathMonitor.start();
  healthMonitor.start();
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isCommand()) return;

  const commandName = interaction.commandName as CommandName;
  
  if (commandName in commands) {
    try {
      if (!await hasManagerRole(interaction as ChatInputCommandInteraction)) {
        await interaction.reply({ 
          content: '❌ Você não tem permissão para usar este comando. Apenas usuários com o cargo de gerenciador podem utilizá-lo.',
          ephemeral: true 
        });
        return;
      }

      await commands[commandName](interaction as ChatInputCommandInteraction);
    } catch (error) {
      console.error(`Erro ao executar comando ${commandName}:`, error);
      await interaction.reply({ 
        content: 'Ocorreu um erro ao executar este comando.',
        ephemeral: true 
      });
    }
  }
});

// Manipuladores de sinais para graceful shutdown
const handleShutdownSignal = async (signal: string) => {
  try {
    await ShutdownManager.shutdown(signal, client);
    process.exit(0);
  } catch (error) {
    console.error('Erro fatal durante o desligamento:', error);
    process.exit(1);
  }
};

// Registra os handlers para diferentes sinais
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
process.on('SIGQUIT', () => handleShutdownSignal('SIGQUIT'));

// Manipulador de exceções não tratadas
process.on('uncaughtException', async (error) => {
  console.error('Exceção não tratada:', error);
  logtail.error(`Exceção não tratada: ${error}`);
  await handleShutdownSignal('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', async (reason) => {
  console.error('Promise rejection não tratada:', reason);
  logtail.error(`Promise rejection não tratada: ${reason}`);
  await handleShutdownSignal('UNHANDLED_REJECTION');
});

client.login(config.discord.token);
