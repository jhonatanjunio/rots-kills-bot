import { REST, Routes } from 'discord.js';
import { commandsData } from './commands';
import config from './config';

const rest = new REST({ version: '10' }).setToken(config.discord.token);

async function deleteCommands() {
  try {
    console.log('Iniciando remoção dos comandos antigos...');
    
    // Busca todos os comandos existentes
    const existingCommands = await rest.get(
      Routes.applicationCommands(config.discord.clientId)
    ) as any[];

    // Remove cada comando
    for (const command of existingCommands) {
      await rest.delete(
        Routes.applicationCommand(config.discord.clientId, command.id)
      );
      console.log(`Comando /${command.name} removido`);
    }

    console.log('Todos os comandos antigos foram removidos!');
  } catch (error) {
    console.error('Erro ao remover comandos:', error);
  }
}

async function registerCommands() {
  try {
    console.log('Iniciando registro dos novos comandos...');

    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commandsData }
    );

    console.log('Comandos registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
}

(async () => {
  await deleteCommands();
  await registerCommands();
})();
