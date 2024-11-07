import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Database } from '../services/database';
import { GameAPI } from '../services/gameApi';
import { DeathLogEntry } from '../models/Deathlog';

export async function showPlayerStats(interaction: ChatInputCommandInteraction) {
  const playerName = interaction.options.getString('name');

  try {
    if (!playerName) {
      await interaction.reply('Nome do jogador não fornecido.');
      return;
    }

    await interaction.deferReply();

    const player = await Database.getPlayer(playerName);
    if (!player) {
      await interaction.editReply(`Jogador ${playerName} não está sendo monitorado. Use /addplayer primeiro.`);
      return;
    }

    // Busca todas as mortes do banco de dados
    const allDeathLogs = await Database.getAllPlayerDeathLogs();
    const playerDeaths = allDeathLogs.filter(death => death.playerName.toLowerCase() === playerName.toLowerCase());

    // Calcula estatísticas dos últimos 30 dias
    const thirtyDaysAgo = Date.now() / 1000 - (30 * 24 * 60 * 60); // Convertido para segundos
    const recentDeaths = playerDeaths.filter(death => death.timestamp >= thirtyDaysAgo);

    // Calcula o assassino mais frequente (all-time)
    const killerCount = new Map<string, number>();
    playerDeaths.forEach(death => {
      killerCount.set(death.killed_by, (killerCount.get(death.killed_by) || 0) + 1);
    });

    let topKiller = { name: 'Ninguém', count: 0 };
    killerCount.forEach((count, killer) => {
      if (count > topKiller.count) {
        topKiller = { name: killer, count };
      }
    });

    // Busca informações atualizadas do jogador na API
    const { player: currentInfo } = await GameAPI.getPlayerInfo(playerName);
    const getAvatar = GameAPI.getAvatar(player.vocation);

    // Cria um embed rico para mostrar as estatísticas
    const statsEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`📊 Estatísticas de ${playerName}`)
      .setThumbnail(getAvatar?.url || 'https://saiyansreturn.com/icon.ico')
      .addFields(
        { 
          name: '📈 Level Atual', 
          value: currentInfo?.level?.toString() || 'N/A', 
          inline: true 
        },
        { 
          name: '💀 Total de Mortes', 
          value: playerDeaths.length.toString(), 
          inline: true 
        },
        { 
          name: '⏰ Mortes (30 dias)', 
          value: recentDeaths.length.toString(), 
          inline: true 
        },
        { 
          name: '🔪 Principal Assassino', 
          value: `**${topKiller.name}** (${topKiller.count} mortes)`, 
          inline: false 
        }
      );

    // Adiciona a última morte se existir
    if (recentDeaths.length > 0) {
      const lastDeath = recentDeaths.sort((a: DeathLogEntry, b: DeathLogEntry) => b.timestamp - a.timestamp)[0];
      statsEmbed.addFields({
        name: '⚰️ Última Morte',
        value: `Morto por **${lastDeath.killed_by}** em ${formatTimestamp(lastDeath.timestamp)}`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [statsEmbed] });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    if (interaction.deferred) {
      await interaction.editReply('Erro ao buscar estatísticas do jogador. Tente novamente mais tarde.');
    } else {
      await interaction.reply('Erro ao buscar estatísticas do jogador. Tente novamente mais tarde.');
    }
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}
