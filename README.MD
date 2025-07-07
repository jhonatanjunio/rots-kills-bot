# 🎮 ROTS War Bot

## 📋 Sobre
Bot do Discord desenvolvido para monitorar e gerenciar estatísticas de jogadores do Saiyans Return (ROTS). O bot rastreia mortes (PvP e PvE), mantém rankings, envia alertas e fornece informações detalhadas sobre o desempenho dos jogadores aliados e inimigos.

### 🎯 **Principais Melhorias Recentes**
- ✅ **Sistema de Rate Limiting Inteligente**: Solução robusta que elimina completamente os problemas de erro 429
- ✅ **Recuperação Automática**: Bot nunca mais trava e se recupera automaticamente de qualquer problema
- ✅ **Logs Limpos**: Console organizado sem spam de erros, apenas informações relevantes
- ✅ **Monitoramento em Tempo Real**: Comando `/systemstatus` para acompanhar a saúde do sistema
- ✅ **Otimização Automática**: Sistema se ajusta automaticamente para máxima eficiência e estabilidade

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
- `/systemstatus` — Exibe status detalhado do sistema de monitoramento, rate limiting e robôs
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

### 5. Sistema de Rate Limiting Inteligente 🧠
- **Persistência de estado**: Salva progresso e configurações automaticamente
- **Cooldown adaptativo**: Ajusta automaticamente baseado no histórico de erros
- **Pausa global inteligente**: Para o sistema automaticamente após múltiplos erros 429
- **Recuperação automática**: Retoma processamento quando seguro
- **Análise de tendências**: Monitora padrões de erro em tempo real
- **Otimização automática**: Reduz cooldowns quando sistema está estável
- **Logs categorizados**: Sistema de logs inteligente que evita spam no console

### 6. Recursos Técnicos e Arquiteturais
- Cache inteligente para evitar requisições duplicadas à API
- Sistema de filas e robôs para processamento paralelo dos jogadores
- Sistema de backup e restauração automática do banco de dados
- Logging detalhado e tratamento robusto de erros
- Proteção contra duplicação de dados e rate limiting avançado
- Persistência de estado para recuperação após reinicializações
- Sistema de monitoramento em tempo real com métricas detalhadas

### 7. Segurança
- Rate limiting inteligente para evitar banimento por excesso de requisições
- Sistema de recuperação automática após bloqueios temporários
- Validação de entradas e gerenciamento seguro de tokens
- Detecção e tratamento diferenciado para erros 403, 429 e timeouts

## 🔧 Tecnologias Utilizadas

- **TypeScript** (strict mode) — Tipagem forte e desenvolvimento seguro
- **Discord.js** — Integração completa com Discord API
- **Puppeteer** — Automação de browser para interação com APIs
- **Jest** — Framework de testes automatizados
- **Node.js** — Runtime de alta performance
- **Moment.js** — Manipulação avançada de datas
- **Sistema de Persistência** — Gerenciamento de estado com arquivos JSON
- **Rate Limiting Adaptativo** — Algoritmos inteligentes de controle de requisições

## 💻 Arquitetura

O projeto está organizado em vários módulos principais:

1. **Serviços Core**
   - BrowserService: Interação inteligente com a API do jogo
   - DeathMonitor: Sistema de monitoramento em tempo real
   - Database: Gerenciamento de dados com backup automático
   - GameAPI: Interface com a API do jogo
   - QueueService: Processamento paralelo com robôs
   - RateLimitStateService: Gestão inteligente de rate limiting
   - SmartLogger: Sistema de logs categorizados e otimizados

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

5. **Sistema de Rate Limiting Inteligente**
- Persistência de estado para recuperação após reinicializações
- Análise de tendências de erro e recomendações automáticas
- Otimização automática do cooldown baseada em performance
```typescript
// Sistema adaptativo que ajusta cooldowns baseado no histórico
async optimizeCooldown(): Promise<void> {
  const stats = this.analyzeCurrentState();
  if (stats.successRate > 95 && this.state.globalCooldown > this.state.config.baseCooldown) {
    this.state.globalCooldown = Math.max(
      this.state.config.baseCooldown,
      this.state.globalCooldown * 0.9
    );
  }
}
```

6. **Sistema de Logs Inteligente**
- Categorização automática de tipos de erro
- Supressão inteligente de mensagens repetitivas
- Logs contextualizados com informações dos robôs e operações
```typescript
// Logs categorizados que evitam spam no console
static error(message: string, context?: LogContext): void {
  if (this.isRateLimitMessage(message)) {
    if (this.shouldSuppressRateLimitLog(message)) {
      logtail.debug(`[RATE_LIMIT_ERROR] ${message}`);
      return;
    }
    logtail.warn(`[RATE_LIMIT] ${message}`);
  }
}
```

7. **Arquitetura Modular**
- Separação clara de responsabilidades
- Serviços independentes e bem definidos
- Sistema de tipos forte com TypeScript

Cada um destes destaques técnicos foi implementado pensando em performance, manutenibilidade e confiabilidade do sistema.

## 🔐 Segurança e Robustez

- **Rate limiting inteligente com recuperação automática**
  - Detecção automática de diferentes tipos de erro (429, 403, timeout)
  - Pausas escalonadas baseadas na frequência de erros
  - Recuperação gradual com cooldowns adaptativos
- **Proteção contra duplicação de dados**
- **Validação rigorosa de entradas**
- **Gerenciamento seguro de tokens e credenciais**
- **Sistema de backup automático e restauração de dados**

## 📊 Funcionalidades de Monitoramento

- **Rastreamento em tempo real** de mortes (PvP e PvE)
- **Análise avançada** de estatísticas e histórico de combates
- **Sistema de ranking** e guerra entre times com períodos customizáveis
- **Logs detalhados** de mortes por monstros e trocas de classe
- **Monitoramento do sistema**: Status dos robôs, rate limiting e performance
- **Métricas em tempo real**: Taxa de sucesso, tendências de erro, cooldowns
- **Alertas automáticos**: Detecção de problemas e recomendações de ação

## 🛠️ Recursos Técnicos Avançados

- **Arquitetura modular e escalável** com serviços independentes
- **Sistema de logging inteligente** com categorização e supressão automática
- **Rate limiting adaptativo** com otimização automática
- **Persistência de estado** para recuperação após reinicializações
- **Processamento paralelo** com sistema de filas e robôs
- **Monitoramento em tempo real** com métricas detalhadas
- **Testes automatizados** com ambiente isolado
- **Tratamento robusto de erros** com recuperação automática

---

## ✅ Funcionalidades Implementadas

- [✅] **Sistema de Rate Limiting Inteligente** — Solução robusta para erro 429 com recuperação automática
- [✅] **Persistência de Estado** — Sistema nunca perde progresso após reinicializações
- [✅] **Logs Inteligentes** — Console limpo com categorização automática de erros
- [✅] **Monitoramento do Sistema** — Comando `/systemstatus` para acompanhar performance em tempo real
- [✅] **Otimização Automática** — Sistema se ajusta automaticamente para máxima eficiência
- [✅] Registro de mortes por monstros e envio para canal específico
- [✅] Registro de troca de classe e envio para canal específico
- [✅] Função de guerra com análise de período customizável e ranking de aliados

## 📋 Próximas Melhorias

- [ ] **Importação de lista de jogadores:** Comando Discord para importar lista de jogadores em lote
- [ ] **Dashboard web:** Interface web para monitoramento avançado do sistema
- [ ] **Alertas proativos:** Notificações quando sistema detecta problemas potenciais
- [ ] **Métricas históricas:** Gráficos de performance e tendências ao longo do tempo
- [ ] **Configuração dinâmica:** Ajuste de parâmetros do sistema via comandos Discord