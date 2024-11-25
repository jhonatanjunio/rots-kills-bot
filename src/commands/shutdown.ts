import { ChatInputCommandInteraction } from 'discord.js';
import { Database } from '../services/database';
import { DeathMonitor } from '../services/deathMonitor';

export async function shutdown(interaction: ChatInputCommandInteraction) {
  await interaction.reply('🔄 Iniciando processo de desligamento seguro...');
  
  try {
    // Para o monitor usando o getter público
    const monitor = DeathMonitor.getInstance();
    if (monitor) {
      monitor.stop();
    }
    
    // Para o serviço de backup
    Database.stopBackupService();
    
    // Salva todos os dados
    await Database.saveAll();
    
    await interaction.editReply('✅ Bot desligado com sucesso! Você pode fechar o terminal agora.');
    
    // Encerra o processo
    process.exit(0);
  } catch (error) {
    await interaction.editReply('❌ Erro ao desligar o bot: ' + error);
    process.exit(1);
  }
}
