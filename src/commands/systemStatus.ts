import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { QueueService } from '../services/queueService';
import { RateLimitStateService } from '../services/rateLimitState';
import { SmartLogger } from '../utils/smartLogger';

export async function systemStatus(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();

    const queueService = QueueService.getInstance();
    const rateLimitState = RateLimitStateService.getInstance();
    
    // Obtém estatísticas dos serviços
    const queueStats = queueService.getQueueStats();
    const rateLimitStats = rateLimitState.getStats();

    // Cria embed principal
    const embed = new EmbedBuilder()
      .setColor(rateLimitStats.isGloballyPaused ? '#FF6B6B' : '#4ECDC4')
      .setTitle('📊 Status do Sistema')
      .setTimestamp();

    // Status geral
    let statusIcon = '🟢';
    let statusText = 'Sistema funcionando normalmente';
    
    if (rateLimitStats.isGloballyPaused) {
      statusIcon = '🔴';
      statusText = `Sistema pausado: ${rateLimitStats.pauseReason}`;
    } else if (rateLimitStats.recent429s > 3) {
      statusIcon = '🟡';
      statusText = 'Rate limiting ativo - processamento mais lento';
    } else if (rateLimitStats.recent403s > 0) {
      statusIcon = '🟠';
      statusText = 'Possível bloqueio detectado';
    }

    embed.addFields([
      {
        name: `${statusIcon} Status Geral`,
        value: statusText,
        inline: false
      }
    ]);

    // Estatísticas de Rate Limiting
    const rateLimitInfo = [
      `**Cooldown Atual:** ${rateLimitStats.globalCooldown}s`,
      `**Taxa de Sucesso:** ${rateLimitStats.successRate}%`,
      `**Erros 429 (5min):** ${rateLimitStats.recent429s}`,
      `**Erros 403 (30min):** ${rateLimitStats.recent403s}`,
      `**Total Sucessos:** ${rateLimitStats.totalSuccesses}`,
      `**Total Erros:** ${rateLimitStats.totalErrors}`
    ];

    if (rateLimitStats.pauseUntil) {
      const pauseEnd = new Date(rateLimitStats.pauseUntil);
      const timeLeft = Math.max(0, pauseEnd.getTime() - Date.now());
      rateLimitInfo.push(`**Pausa até:** ${pauseEnd.toLocaleString('pt-BR')} (${Math.round(timeLeft/60000)}min)`);
    }

    embed.addFields([
      {
        name: '⚡ Rate Limiting',
        value: rateLimitInfo.join('\n'),
        inline: true
      }
    ]);

    // Status dos Robôs
    const robotInfo: string[] = [];
    for (const [key, value] of Object.entries(queueStats)) {
      if (key.startsWith('robô_')) {
        const robot = value as any;
        const statusEmoji = robot.status === 'running' ? '🟢' : '🔴';
        const lastRun = robot.lastRunTime ? 
          `Última execução: ${new Date(robot.lastRunTime).toLocaleString('pt-BR')}` : 
          'Nunca executado';
        
        robotInfo.push(`${statusEmoji} **${key.replace('_', ' ').toUpperCase()}**`);
        robotInfo.push(`Status: ${robot.status}`);
        robotInfo.push(`${lastRun}\n`);
      }
    }

    embed.addFields([
      {
        name: '🤖 Status dos Robôs',
        value: robotInfo.join('\n') || 'Nenhum robô configurado',
        inline: true
      }
    ]);

    // Progresso dos Robôs (se disponível)
    if (rateLimitStats.robotProgress && rateLimitStats.robotProgress.length > 0) {
      const progressInfo = rateLimitStats.robotProgress.map((progress: any) => {
        const phaseEmojis: Record<string, string> = {
          'initializing': '🔄',
          'processing': '⚡',
          'paused': '⏸️',
          'error_recovery': '🔧'
        };
        const phaseEmoji = phaseEmojis[progress.currentPhase] || '❓';
        
        const lastPlayer = progress.lastProcessedPlayerId ? 
          `Último player: ${progress.lastProcessedPlayerId}` : 
          'Nenhum player processado';
        
        return `${phaseEmoji} **Robô ${progress.robotId}:** ${progress.currentPhase}\n${lastPlayer}`;
      }).join('\n\n');

      embed.addFields([
        {
          name: '📈 Progresso dos Robôs',
          value: progressInfo,
          inline: false
        }
      ]);
    }

    // Tendências e Recomendações
    if (rateLimitStats.trends) {
      const trends = rateLimitStats.trends;
      let trendEmoji = '📊';
      
      switch (trends.errorTrend) {
        case 'improving': trendEmoji = '📈'; break;
        case 'worsening': trendEmoji = '📉'; break;
        case 'stable': trendEmoji = '📊'; break;
        default: trendEmoji = '❓';
      }

      const trendsInfo = [
        `${trendEmoji} **Tendência:** ${trends.errorTrend}`,
        `🎯 **Recomendação:** ${trends.recommendedAction}`
      ];

      if (trends.timeToNextOptimization) {
        const timeToOpt = Math.round(trends.timeToNextOptimization / 60000);
        trendsInfo.push(`⏰ **Próxima otimização:** ${timeToOpt}min`);
      }

      embed.addFields([
        {
          name: '🎯 Análise e Recomendações',
          value: trendsInfo.join('\n'),
          inline: false
        }
      ]);
    }

    // Última atualização
    if (rateLimitStats.lastSuccess) {
      embed.setFooter({ 
        text: `Último sucesso: ${new Date(rateLimitStats.lastSuccess).toLocaleString('pt-BR')}` 
      });
    }

    await interaction.editReply({ embeds: [embed] });

    // Log do comando
    SmartLogger.debug('Status do sistema consultado', {
      service: 'SystemStatus',
      operation: 'consulta_status'
    });

  } catch (error) {
    SmartLogger.error(`Erro ao buscar status do sistema: ${error}`, {
      service: 'SystemStatus'
    });
    
    await interaction.editReply({
      content: '❌ Erro ao buscar informações do sistema. Tente novamente.'
    });
  }
} 