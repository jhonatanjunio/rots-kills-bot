import { DeathMonitor } from './deathMonitor';
import { logtail } from '../utils/logtail';

export class HealthMonitor {
    private static instance: HealthMonitor;
    private checkInterval: NodeJS.Timeout | null = null;
    private readonly CHECK_INTERVAL = 60000; // Verifica a cada 1 minuto
    private consecutiveUnhealthyChecks = 0;
    private readonly MAX_UNHEALTHY_CHECKS = 3;

    private constructor(private deathMonitor: DeathMonitor) { }

    static initialize(deathMonitor: DeathMonitor): HealthMonitor {
        if (!this.instance) {
            this.instance = new HealthMonitor(deathMonitor);
        }
        return this.instance;
    }

    start() {
        if (this.checkInterval) return;

        this.checkInterval = setInterval(() => {
            this.checkHealth();
        }, this.CHECK_INTERVAL);

        logtail.info('🏥 Monitor de saúde iniciado');
    }

    private async checkHealth() {
        if (!this.deathMonitor.isHealthy()) {
            this.consecutiveUnhealthyChecks++;
            logtail.warn(`⚠️ Serviço não saudável (${this.consecutiveUnhealthyChecks}/${this.MAX_UNHEALTHY_CHECKS} verificações)`);

            if (this.consecutiveUnhealthyChecks >= this.MAX_UNHEALTHY_CHECKS) {
                logtail.error('🔄 Reiniciando serviço após múltiplas verificações não saudáveis');

                try {
                    this.deathMonitor.stop();
                    await this.deathMonitor.start();
                    this.consecutiveUnhealthyChecks = 0;
                    logtail.info('✅ Serviço reiniciado com sucesso');
                } catch (error) {
                    logtail.error(`❌ Falha ao reiniciar o serviço: ${error}`);
                }
            }
        } else {
            if (this.consecutiveUnhealthyChecks > 0) {
                logtail.info('✅ Serviço voltou ao estado saudável');
            }
            this.consecutiveUnhealthyChecks = 0;
        }
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            logtail.info('🛑 Monitor de saúde parado');
        }
    }
}