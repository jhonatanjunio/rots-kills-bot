import { ChatInputCommandInteraction } from 'discord.js';
import config from '../config';

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
