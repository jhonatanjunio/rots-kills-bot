# 🎮 ROTS War Bot

## 📋 Sobre
Bot do Discord desenvolvido para monitorar e gerenciar estatísticas de jogadores do Saiyans Return (ROTS). O bot rastreia mortes, mantém rankings e fornece informações detalhadas sobre o desempenho dos jogadores.

## ⚡ Principais Funcionalidades

### 1. Monitoramento de Jogadores
- Rastreamento automático de mortes
- Sistema de aliados e inimigos
- Atualização em tempo real

### 2. Comandos Discord
- `/addplayer` - Adiciona um jogador ao monitoramento
- `/removeplayer` - Remove um jogador do monitoramento
- `/playerstats` - Exibe estatísticas detalhadas do jogador
- `/ranking` - Mostra ranking de KDA (Kills/Deaths/Assists)

### 3. Sistema de Estatísticas
- Contagem de mortes
- Rastreamento de KDA
- Histórico de combates
- Análise de períodos (24h, 7d, 30d, total)

### 4. Notificações
- Alertas de morte em tempo real
- Detalhes do combate
- Informações do assassino

## 🔧 Tecnologias Utilizadas

- TypeScript
- Discord.js
- Puppeteer
- Jest (Testes)
- Node.js
- Moment.js

## 💻 Arquitetura

O projeto está organizado em vários módulos principais:

1. **Serviços Core**
   - BrowserService: Interação com a API do jogo
   - DeathMonitor: Sistema de monitoramento
   - Database: Gerenciamento de dados
   - GameAPI: Interface com a API do jogo

2. **Comandos Discord**
   - Sistema modular de comandos
   - Gerenciamento de interações
   - Formatação rica de mensagens

3. **Sistema de Testes**
   - Testes de integração
   - Mocks para serviços externos
   - Ambiente de teste isolado

## 🚀 Destaques Técnicos

1. **Sistema de Cache Inteligente**
- Implementação de cache em memória para reduzir requisições à API
- Índice otimizado para logs de morte usando Set para evitar duplicatas
- Sistema de hash para identificação única de eventos
```typescript
private static createDeathLogHash(deathLog: DeathLogEntry): string {
return `${deathLog.playerName}-${deathLog.killed_by}-${deathLog.mostdamage_by}-${deathLog.timestamp}-${deathLog.level}`;
}
```

2. **Monitoramento em Tempo Real**
- Sistema robusto de monitoramento usando Puppeteer
- Processamento assíncrono de eventos de morte
- Notificações instantâneas via Discord Embeds
```typescript
private async processNewDeaths(player: any, deaths: any[]) {
  const deathAlert = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('⚠️ ALERTA DE MORTE ⚠️')
    // ... configuração do embed
    .setFooter({ text: 'Mantenha-se alerta! Proteja seus aliados!' });
}
```

3. **Interface Rica com Discord**
- Comandos Slash integrados
- Embeds personalizados para melhor visualização
- Sistema de rankings com períodos customizáveis
```typescript
export async function showRanking(interaction: ChatInputCommandInteraction) {
  const period = interaction.options.getString('period');
  const options = parseRankingPeriod(period);
  // ... lógica de ranking
}
```

4. **Sistema de Testes Abrangente**
- Mocks para serviços externos
- Testes de integração automatizados
- Ambiente de teste isolado
```typescript
describe('DeathMonitor', () => {
  let monitor: DeathMonitor;
  let mockClient: Client;
  // ... configuração de testes
});
```

5. **Arquitetura Modular**
- Separação clara de responsabilidades
- Serviços independentes e bem definidos
- Sistema de tipos forte com TypeScript

Cada um destes destaques técnicos foi implementado pensando em performance, manutenibilidade e confiabilidade do sistema.

## 🔐 Segurança

- Sistema de rate limiting
- Proteção contra duplicação de dados
- Validação de entradas
- Gerenciamento seguro de tokens

## 📊 Funcionalidades de Monitoramento

- Rastreamento de mortes em tempo real
- Análise de estatísticas
- Sistema de ranking
- Histórico detalhado de combates

## 🛠️ Recursos Técnicos

- Typescript strict mode
- Arquitetura modular
- Sistema de logging
- Tratamento de erros robusto
- Testes automatizados


Este bot é uma ferramenta completa para gerenciamento de guerra no ROTS, oferecendo monitoramento em tempo real, estatísticas detalhadas e uma interface amigável através do Discord. A arquitetura é robusta e bem organizada, com foco em performance e confiabilidade.