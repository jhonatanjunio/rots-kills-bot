import { Client, GatewayIntentBits, IntentsBitField, Interaction, Options, Partials, ChatInputCommandInteraction } from 'discord.js';
import config from './config/config.json';
import { Database } from './services/database';
import { commands, CommandName, registerCommands } from './commands';
import { DeathMonitor } from './services/deathMonitor';
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
  await Database.load();
  await registerCommands(client);
  const deathMonitor = DeathMonitor.initialize(client);
  await deathMonitor.start();
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isCommand()) return;

  const commandName = interaction.commandName as CommandName;
  
  if (commandName in commands) {
    try {
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

client.login(config.discord.token);
