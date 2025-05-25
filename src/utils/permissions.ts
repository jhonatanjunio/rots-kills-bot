import { ChatInputCommandInteraction } from 'discord.js';
import config from '../config';
import fs from 'fs-extra';
import path from 'path';
import { logtail } from './logtail';

async function hasManagerRole(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild) return false;
  
  const member = await interaction.guild.members.fetch(interaction.user.id);
  return member.roles.cache.has(config.discord.managerRole);
}

async function isAllowedUser(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild) return false;
  
  return config.discord.allowedUserIds.length > 0 && (config.discord.allowedUserIds as string[]).includes(interaction.user.id);
}

export { hasManagerRole, isAllowedUser };

export class PermissionsUtil {
  static async ensureChromePermissions(): Promise<void> {
    try {
      const isExecutable = process.execPath.endsWith('.exe');
      const baseDir = isExecutable ? path.dirname(process.execPath) : process.cwd();
      const chromiumDir = path.join(baseDir, '.local-chromium');
      
      if (!fs.existsSync(chromiumDir)) {
        logtail.error('Diretório .local-chromium não encontrado');
        return;
      }

      const chromePath = path.join(chromiumDir, 'chrome.exe');
      
      try {
        // Tenta modificar as permissões do diretório e do arquivo
        await fs.chmod(chromiumDir, 0o777);
        await fs.chmod(chromePath, 0o777);

        // Lista todos os arquivos no diretório
        const files = await fs.readdir(chromiumDir);
        
        // Aplica permissões para todos os arquivos
        for (const file of files) {
          const filePath = path.join(chromiumDir, file);
          try {
            await fs.chmod(filePath, 0o777);
          } catch (err: any) {
            logtail.error(`Erro ao modificar permissões de ${file}: ${err.message}`);
          }
        }

        // Verifica se conseguimos acessar o chrome.exe
        await fs.access(chromePath, fs.constants.R_OK | fs.constants.X_OK);
        logtail.info('Permissões do Chrome configuradas com sucesso');
      } catch (err: any) {
        logtail.error(`Erro ao configurar permissões: ${err.message}`);
        
        // Se falhar, tenta criar uma cópia do Chrome em uma pasta temporária
        try {
          const tempDir = path.join(baseDir, 'temp-chrome');
          await fs.ensureDir(tempDir);
          await fs.copy(chromiumDir, tempDir, { overwrite: true });
          
          // Tenta modificar as permissões da cópia
          await fs.chmod(tempDir, 0o777);
          const tempChromePath = path.join(tempDir, 'chrome.exe');
          await fs.chmod(tempChromePath, 0o777);
          
          // Se conseguir acessar a cópia, atualiza o caminho original
          await fs.access(tempChromePath, fs.constants.R_OK | fs.constants.X_OK);
          await fs.remove(chromiumDir);
          await fs.move(tempDir, chromiumDir);
          
          logtail.info('Chrome copiado e permissões configuradas com sucesso');
        } catch (copyErr: any) {
          logtail.error(`Erro ao tentar copiar Chrome: ${copyErr.message}`);
        }
      }
    } catch (err: any) {
      logtail.error(`Erro ao configurar permissões: ${err.message}`);
    }
  }
}
