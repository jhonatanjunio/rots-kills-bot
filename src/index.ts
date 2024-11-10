import { Client, GatewayIntentBits, IntentsBitField, Interaction, Options, Partials, ChatInputCommandInteraction } from 'discord.js';
import config from './config';
import { Database } from './services/database';
import { commands, CommandName, registerCommands } from './commands';
import { DeathMonitor } from './services/deathMonitor';
import { hasManagerRole } from './utils/permissions';
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
  await deathMonitor.start();
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

client.login(config.discord.token);
