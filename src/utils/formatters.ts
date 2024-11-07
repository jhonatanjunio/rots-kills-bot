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
  
  // Multiplica por 1000 pois o timestamp está em segundos e o moment espera milissegundos
  return moment(timestamp * 1000)
    .tz('America/Sao_Paulo')
    .format('DD/MM/YYYY HH:mm:ss');
}
