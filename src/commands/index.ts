import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { addPlayer } from './addPlayer';
import { showPlayerStats } from './showPlayerStats';
import { removePlayer } from './removePlayer';
import { showRanking } from './showRanking';
import { war } from './war';


// Tipo para os nomes dos comandos
export type CommandName = 'addplayer' | 'playerstats' | 'removeplayer' | 'ranking' | 'war';

// Tipo para as funções dos comandos
type CommandFunction = (interaction: ChatInputCommandInteraction) => Promise<void>;

// Interface para o objeto de comandos
interface CommandsMap {
  [key: string]: CommandFunction;
}

// Definição dos comandos slash
export const commandsData = [
  new SlashCommandBuilder()
    .setName('addplayer')
    .setDescription('Adiciona um jogador para ser monitorado')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Nome do jogador')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Tipo do jogador')
        .setRequired(true)
        .addChoices(
          { name: '👥 Aliado', value: 'ally' },
          { name: '⚔️ Inimigo', value: 'enemy' }
        )
    ),

  new SlashCommandBuilder()
    .setName('removeplayer')
    .setDescription('Remove um jogador da lista de monitoramento')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Nome do jogador')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('playerstats')
    .setDescription('Mostra estatísticas de um jogador')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Nome do jogador')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking de KDA dos jogadores')
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Período do ranking')
        .setRequired(false)
        .addChoices(
          { name: 'Últimas 24 horas', value: '24h' },
          { name: 'Últimos 7 dias', value: '7d' },
          { name: 'Últimos 30 dias', value: '30d' },
          { name: 'Histórico completo', value: 'all' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('page')
        .setDescription('Página do ranking (15 jogadores por página)')
        .setMinValue(1)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('war')
    .setDescription('Mostra estatísticas da guerra em um período específico')
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Período (ex: 1h, 30m, 2h 30m)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('page')
        .setDescription('Página das estatísticas (use apenas se houver mais de 10 jogadores)')
        .setMinValue(1)
        .setRequired(false)
    ),
] as const;

// Mapeamento dos comandos para suas funções executoras
export const commands: Record<CommandName, CommandFunction> = {
  addplayer: addPlayer,
  playerstats: showPlayerStats,
  removeplayer: removePlayer,
  ranking: showRanking,
  war: war,
};

// Função para registrar os comandos no Discord
export async function registerCommands(client: any) {
  try {
    console.log('Iniciando registro dos comandos slash...');
    
    await client.application?.commands.set(commandsData);

    console.log('Comandos slash registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos slash:', error);
  }
}
