import { ChatInputCommandInteraction } from 'discord.js';
import config from '../config/config.json';

export async function hasManagerRole(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild) return false;
  
  const member = await interaction.guild.members.fetch(interaction.user.id);
  return member.roles.cache.has(config.discord.managerRole);
}
