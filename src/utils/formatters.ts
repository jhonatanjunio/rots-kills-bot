import moment from 'moment-timezone';

export function formatDate(timestamp: number): string {
  if (!timestamp) return 'N/A';
  
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatKDA(kda: number): string {
  if (isNaN(kda) || !isFinite(kda)) return '0.00';
  return kda.toFixed(2);
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return `${seconds} segundos atrás`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutos atrás`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} horas atrás`;
  return `${Math.floor(seconds / 86400)} dias atrás`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString('pt-BR');
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return 'N/A';
  
  // Verifica se o timestamp está em milissegundos (mais de 13 dígitos)
  const timestampInMs = timestamp.toString().length > 13 ? 
    timestamp : // já está em milissegundos
    timestamp * 1000; // converte de segundos para milissegundos
  
  return moment(timestampInMs)
    .tz('America/Sao_Paulo')
    .format('DD/MM/YYYY HH:mm:ss');
}

export function isFromToday(timestamp: number): boolean {
  const today = moment().tz('America/Sao_Paulo').startOf('day');
  const tomorrow = moment().tz('America/Sao_Paulo').startOf('day').add(1, 'day');
  const deathDate = moment(timestamp * 1000).tz('America/Sao_Paulo');
  
  return deathDate.isBetween(today, tomorrow);
}
