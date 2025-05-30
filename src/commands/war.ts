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
  
  // Filtra primeiro todas as mortes do período
  const periodDeathLogs = deathLogs.filter(log => log.timestamp >= startTimestamp);
  
  // Cria um Set com os nomes dos jogadores do time atual
  const teamPlayerNames = new Set(players.map(p => p.name.toLowerCase()));
  
  // Pega todas as mortes que envolvem jogadores do time (seja como vítima ou killer)
  const relevantDeaths = periodDeathLogs.filter(log => 
    teamPlayerNames.has(log.playerName.toLowerCase()) || 
    teamPlayerNames.has(log.killed_by.toLowerCase()) ||
    teamPlayerNames.has(log.mostdamage_by.toLowerCase())
  );

  // Processa as estatísticas para cada jogador do time
  for (const player of players) {
    const deaths = relevantDeaths.filter(
      log => log.playerName.toLowerCase() === player.name.toLowerCase()
    ).length;

    const kills = relevantDeaths.filter(
      log => log.killed_by.toLowerCase() === player.name.toLowerCase()
    ).length;

    const assists = relevantDeaths.filter(
      log => log.mostdamage_by.toLowerCase() === player.name.toLowerCase()
    ).length;

    const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;    

    if (kills > 0 || deaths > 0 || assists > 0 || kda > 0) {
      playerStats.push({
        name: player.name,
        kills,
        deaths,
        assists,
        kda: Number(formatKDA(kda))
      });
    }
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
    const period = parsePeriod(periodStr);
    
    const now = moment().tz('America/Sao_Paulo');
    const startTimestamp = now.unix() - period.seconds;

    const allPlayers = await Database.getAllMonitoredPlayers();
    const deathLogs = await Database.getAllPlayerDeathLogs();

    const allyPlayers = allPlayers.filter(p => p.isAlly);
    const enemyPlayers = allPlayers.filter(p => !p.isAlly);

    const allyStats = await calculateTeamStats(allyPlayers, deathLogs, startTimestamp);
    const enemyStats = await calculateTeamStats(enemyPlayers, deathLogs, startTimestamp);

    const { buffer } = await ImageGenerator.generateWarStats(
      period.humanReadable,
      allyStats,
      enemyStats
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'war-stats.png' });

    await interaction.editReply({
      content: `Estatísticas de Guerra - ${period.humanReadable}`,
      files: [attachment]
    });

  } catch (error) {
    console.error('Erro ao gerar estatísticas de guerra:', error);
    logtail.error(`Erro ao gerar estatísticas de guerra: ${error}`);
    await interaction.editReply('❌ Erro ao gerar estatísticas de guerra. Tente novamente mais tarde.');
  }
}
