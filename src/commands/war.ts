import { ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { Database } from '../services/database';
import { formatKDA } from '../utils/formatters';
import moment from 'moment-timezone';
import { ImageGenerator } from '../services/imageGenerator';
import { PlayerStats, TeamStats } from '../models/TeamStats';
import { logtail } from '../utils/logtail';

interface PeriodInfo {
  seconds: number;
  humanReadable: string;
}

function parsePeriod(periodStr: string): PeriodInfo {
  let totalMinutes = 0;
  const parts: string[] = [];
  const regex = /(\d+)([dhms])/g;
  let match;

  while ((match = regex.exec(periodStr)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'd':
        totalMinutes += value * 24 * 60; // Dias para minutos
        parts.push(`${value} dia${value !== 1 ? 's' : ''}`);
        break;
      case 'h':
        totalMinutes += value * 60;
        parts.push(`${value} hora${value !== 1 ? 's' : ''}`);
        break;
      case 'm':
        totalMinutes += value;
        parts.push(`${value} minuto${value !== 1 ? 's' : ''}`);
        break;
      case 's':
        totalMinutes += value / 60;
        parts.push(`${value} segundo${value !== 1 ? 's' : ''}`);
        break;
    }
  }

  // Formata a string legível
  let humanReadable = parts.join(' e ');
  if (!humanReadable) {
    humanReadable = 'período inválido';
  }

  return {
    seconds: totalMinutes * 60,
    humanReadable
  };
}

async function calculateTeamStats(
  players: any[],
  deathLogs: any[],
  startTimestamp: number
): Promise<TeamStats> {
  

  const playerStats: PlayerStats[] = [];

  for (const player of players) {
    const deaths = deathLogs.filter(
      log => {
        const isMatch = log.playerName.toLowerCase() === player.name.toLowerCase() &&
          log.timestamp >= startTimestamp;        
        return isMatch;
      }
    ).length;

    const kills = deathLogs.filter(
      log => {
        const isMatch = log.killed_by.toLowerCase() === player.name.toLowerCase() &&
          log.timestamp >= startTimestamp;
        return isMatch;
      }
    ).length;

    const assists = deathLogs.filter(
      log => {
        const isMatch = log.mostdamage_by.toLowerCase() === player.name.toLowerCase() &&
          log.killed_by.toLowerCase() !== player.name.toLowerCase() &&
          log.timestamp >= startTimestamp;        
        return isMatch;
      }
    ).length;

    const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;    

    playerStats.push({
      name: player.name,
      kills,
      deaths,
      assists,
      kda: Number(formatKDA(kda))
    });
  }

  // Ordena por KDA
  playerStats.sort((a, b) => b.kda - a.kda);

  const totalKills = playerStats.reduce((sum, player) => sum + player.kills, 0);
  const totalDeaths = playerStats.reduce((sum, player) => sum + player.deaths, 0);
  const totalAssists = playerStats.reduce((sum, player) => sum + player.assists, 0);
  const averageKDA = totalDeaths === 0 ? 
    totalKills + totalAssists : 
    (totalKills + totalAssists) / totalDeaths;

  return {
    players: playerStats,
    totalKills,
    totalDeaths,
    totalAssists,
    averageKDA: Number(formatKDA(averageKDA))
  };
}

export async function war(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
    
    const periodStr = interaction.options.getString('period', true);
    const page = interaction.options.getInteger('page') || 1;
    const period = parsePeriod(periodStr);
    
    const now = moment().tz('America/Sao_Paulo');
    const startTimestamp = now.unix() - period.seconds;

    const allPlayers = await Database.getAllMonitoredPlayers();
    const deathLogs = await Database.getAllPlayerDeathLogs();

    const allyPlayers = allPlayers.filter(p => p.isAlly);
    const enemyPlayers = allPlayers.filter(p => !p.isAlly);

    const allyStats = await calculateTeamStats(allyPlayers, deathLogs, startTimestamp);
    const enemyStats = await calculateTeamStats(enemyPlayers, deathLogs, startTimestamp);

    const { buffer, totalPages } = await ImageGenerator.generateWarStats(
      period.humanReadable,
      allyStats,
      enemyStats,
      page
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'war-stats.png' });

    // Só mostra a informação de página se houver mais de uma página
    const pageInfo = totalPages > 1 ? `\nPágina ${page}/${totalPages}` : '';

    await interaction.editReply({
      content: `Estatísticas de Guerra - ${period.humanReadable}${pageInfo}`,
      files: [attachment]
    });

  } catch (error) {
    console.error('Erro ao gerar estatísticas de guerra:', error);
    logtail.error(`Erro ao gerar estatísticas de guerra: ${error}`);
    await interaction.editReply('❌ Erro ao gerar estatísticas de guerra. Tente novamente mais tarde.');
  }
}
