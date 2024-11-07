import { ChatInputCommandInteraction } from 'discord.js';
import { GameAPI } from '../services/gameApi';

export async function addPlayer(interaction: ChatInputCommandInteraction) {
  const playerName = interaction.options.getString('name');
  const playerType = interaction.options.getString('type');

  if (!playerName) {
    await interaction.reply('Nome do jogador não fornecido.');
    return;
  }
  
  await interaction.deferReply();
  
  try {
    const isAlly = playerType === 'ally';
    await GameAPI.createPlayer(playerName, isAlly);
    
    const statusEmoji = isAlly ? '👥' : '⚔️';
    const statusText = isAlly ? 'aliado' : 'inimigo';
    
    await interaction.editReply(
      `${statusEmoji} Jogador **${playerName}** adicionado com sucesso como ${statusText}!`
    );
  } catch (error) {
    await interaction.editReply('❌ Erro ao adicionar jogador. Verifique se o nome está correto.');
  }
}
