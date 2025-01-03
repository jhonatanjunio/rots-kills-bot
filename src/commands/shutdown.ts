import { ChatInputCommandInteraction } from 'discord.js';
import { ShutdownManager } from '../services/shutdownManager';
import { logtail } from '../utils/logtail';

export async function shutdown(interaction: ChatInputCommandInteraction) {
  await interaction.reply('🔄 Iniciando processo de desligamento seguro...');
  
  try {
    await ShutdownManager.shutdown(undefined, interaction.client);
    await interaction.editReply('✅ Bot desligado com sucesso! Você pode fechar o terminal agora.');
    process.exit(0);
  } catch (error) {
    const errorMessage = `❌ Erro ao desligar o bot: ${error}`;
    logtail.error(errorMessage);
    await interaction.editReply(errorMessage);
    process.exit(1);
  }
}
