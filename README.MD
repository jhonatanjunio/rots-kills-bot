# 🎮 ROTS War Bot

## 📋 Sobre
Bot do Discord desenvolvido para monitorar e gerenciar estatísticas de jogadores do Saiyans Return (ROTS). O bot rastreia mortes (PvP e PvE), mantém rankings, envia alertas e fornece informações detalhadas sobre o desempenho dos jogadores aliados e inimigos.

## ⚡ Funcionalidades Atuais

### 1. Monitoramento de Jogadores
- Rastreamento automático de mortes (PvP e PvE)
- Sistema de aliados e inimigos
- Atualização em tempo real das informações dos jogadores
- Detecção e registro de troca de classe e mudança de nick

### 2. Comandos Discord Disponíveis
- `/addplayer` — Adiciona um jogador ao monitoramento (aliado ou inimigo)
- `/removeplayer` — Remove um jogador do monitoramento
- `/playerstats` — Exibe estatísticas detalhadas do jogador (nível, mortes, assassino mais frequente, última morte, etc)
- `/ranking` — Mostra ranking de KDA (Kills/Deaths/Assists) dos aliados, com opção de período (24h, 7d, 30d, total)
- `/war` — Mostra estatísticas de guerra entre aliados e inimigos em um período customizável (ex: 1d, 2h 30m)
- `/shutdown` — Desliga o bot de forma segura

### 3. Sistema de Estatísticas
- Contagem de mortes por jogador
- Rastreamento de KDA (Kills, Deaths, Assists)
- Histórico de combates detalhado
- Análise de períodos customizáveis (24h, 7d, 30d, total)
- Ranking visual (imagem) e em tabela ASCII

### 4. Notificações e Alertas
- Alertas de morte em tempo real (PvP e PvE) via Discord Embed
- Detalhes do combate (quem matou, maior dano, horário, etc)
- Notificações de troca de classe e mudança de nick
- Logs separados para mortes por monstros

### 5. Recursos Técnicos e Arquiteturais
- Cache inteligente para evitar requisições duplicadas à API
- Sistema de filas e robôs para processamento paralelo dos jogadores
- Sistema de backup e restauração automática do banco de dados
- Logging detalhado e tratamento robusto de erros
- Proteção contra duplicação de dados e rate limiting

### 6. Segurança
- Rate limiting para evitar banimento por excesso de requisições
- Validação de entradas e gerenciamento seguro de tokens

## 🔧 Tecnologias Utilizadas

- TypeScript (strict mode)
- Discord.js
- Puppeteer
- Jest (testes)
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

- Rastreamento de mortes em tempo real (PvP e PvE)
- Análise de estatísticas e histórico de combates
- Sistema de ranking e guerra entre times
- Logs detalhados de mortes por monstros e trocas de classe

## 🛠️ Recursos Técnicos

- Arquitetura modular e escalável
- Sistema de logging e tratamento de erros
- Testes automatizados

---

## ⚠️ Limitações e TODO

- [ ] **Importação de lista de jogadores:** Ainda não há comando ou função utilitária para importar uma lista de jogadores via comando Discord. Atualmente, a importação em lote só é possível via scripts ou manipulação direta do arquivo `data.json` (ex: `src/scripts/setupExecutableDatabase.ts`).
- [✅] Registro de mortes por monstros e envio para canal específico
- [✅] Registro de troca de classe e envio para canal específico
- [✅] Função de guerra com análise de período customizável e ranking de aliados