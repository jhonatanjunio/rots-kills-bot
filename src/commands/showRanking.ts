import { ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { Database } from '../services/database';
import { formatDate, formatKDA } from '../utils/formatters';
import { DeathLogEntry } from '../models/Deathlog';
import { Player } from '../models/Player';
import { ImageGenerator } from '../services/imageGenerator';
import { PlayerKDA } from '../models/Ranking';
import { logtail } from '../utils/logtail';



async function calculatePlayerKDA(playerName: string, deathLogs: DeathLogEntry[]): Promise<PlayerKDA> {
  // Contagem de mortes (Deaths)
  const deaths = deathLogs.filter((log: DeathLogEntry) => 
    log.playerName.toLowerCase() === playerName.toLowerCase()
  ).length;

  // Contagem de kills
  const kills = deathLogs.filter((log: DeathLogEntry) => 
    log.killed_by.toLowerCase() === playerName.toLowerCase()
  ).length;

  // Contagem de assists (dano mas não kill)
  const assists = deathLogs.filter((log: DeathLogEntry) => 
    log.mostdamage_by.toLowerCase() === playerName.toLowerCase() && 
    log.killed_by.toLowerCase() !== playerName.toLowerCase()
  ).length;

  // Cálculo do KDA
  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths;

  return {
    name: playerName,
    kills,
    deaths,
    assists,
    kda: Number(formatKDA(kda))
  };
}

function createAsciiTable(playerStats: PlayerKDA[]): string {
  const header = 'Pos | Jogador        | K    | D    | A    | KDA  ';
  const separator = '----+---------------+------+------+------+------';
  
  const rows = playerStats.map((stats: PlayerKDA, index: number) => {
    const position = (index + 1).toString().padStart(2);
    const name = stats.name.padEnd(13);
    const kills = stats.kills.toString().padStart(4);
    const deaths = stats.deaths.toString().padStart(4);
    const assists = stats.assists.toString().padStart(4);
    const kda = formatKDA(stats.kda).padStart(4);

    return `${position}  | ${name} | ${kills} | ${deaths} | ${assists} | ${kda}`;
  });

  return [header, separator, ...rows].join('\n');
}

export async function showRanking(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
    
    const period = interaction.options.getString('period');
    const page = interaction.options.getInteger('page') || 1;
    const options = parseRankingPeriod(period);
    
    const players = (await Database.getAllMonitoredPlayers()).filter(p => p.isAlly);
    const deathLogs = await Database.getAllPlayerDeathLogs();
    
    const filteredLogs = period ? deathLogs.filter(log => 
      log.timestamp >= (options.startDate || 0) / 1000 && 
      log.timestamp <= options.endDate / 1000
    ) : deathLogs;

    if (filteredLogs.length === 0) {
      await interaction.editReply('Nenhuma morte registrada no período selecionado.');
      return;
    }

    const playerStats: PlayerKDA[] = [];

    for (const player of players) {
      const stats = await calculatePlayerKDA(player.name, filteredLogs);
      if (stats.kills > 0 || stats.deaths > 0 || stats.assists > 0) {
        playerStats.push(stats);
      }
    }

    // Ordena por KDA
    playerStats.sort((a, b) => b.kda - a.kda);

    const periodText = getPeriodText(period);
    const { buffer, totalPages } = await ImageGenerator.generateRankingStats(
      periodText,
      playerStats,
      page
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

    // Informações de paginação
    const totalPlayers = playerStats.length;
    const startRank = ((page - 1) * 15) + 1;
    const endRank = Math.min(page * 15, totalPlayers);
    
    let content = `Ranking de Guerreiros - ${periodText}`;
    
    // Só mostra informações de paginação se houver mais de uma página
    if (totalPages > 1) {
      content += `\nMostrando ${startRank}º ao ${endRank}º de ${totalPlayers} jogadores`;
      content += `\nPágina ${page}/${totalPages}`;
    }

    await interaction.editReply({
      content,
      files: [attachment]
    });

  } catch (error) {
    console.error('Erro ao gerar ranking:', error);
    logtail.error(`Erro ao gerar ranking: ${error}`);
    await interaction.editReply('❌ Erro ao gerar ranking. Tente novamente mais tarde.');
  }
}

function parseRankingPeriod(period: string | null): { startDate: number, endDate: number } {
  const now = Date.now();
  
  if (!period) {
    return {
      startDate: 0,
      endDate: now
    };
  }

  switch (period) {
    case '24h':
      return {
        startDate: now - (24 * 60 * 60 * 1000),
        endDate: now
      };
    case '7d':
      return {
        startDate: now - (7 * 24 * 60 * 60 * 1000),
        endDate: now
      };
    case '30d':
      return {
        startDate: now - (30 * 24 * 60 * 60 * 1000),
        endDate: now
      };
    default:
      return {
        startDate: 0,
        endDate: now
      };
  }
}

function getPeriodText(period: string | null): string {
  switch (period) {
    case '24h':
      return 'Últimas 24 horas';
    case '7d':
      return 'Últimos 7 dias';
    case '30d':
      return 'Últimos 30 dias';
    default:
      return 'Histórico Completo';
  }
}
