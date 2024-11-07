import { 
  ChatInputCommandInteraction,
} from 'discord.js';
import { Database } from '../services/database';

export async function removePlayer(interaction: ChatInputCommandInteraction) {
  const playerName = interaction.options.getString('name');

  if (!playerName) {
    await interaction.reply('Nome do jogador não fornecido.');
    return;
  }
  
  try {
    const player = await Database.getPlayer(playerName);
    
    if (!player) {
      await interaction.reply(`Jogador ${playerName} não está sendo monitorado.`);
      return;
    }

    await Database.removePlayer(player.id);
    await interaction.reply(`Jogador ${playerName} removido com sucesso!`);
  } catch (error) {
    console.error('Erro ao remover jogador:', error);
    await interaction.reply('Erro ao remover jogador. Tente novamente mais tarde.');
  }
}
