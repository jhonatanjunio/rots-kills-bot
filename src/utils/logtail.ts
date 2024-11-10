import { Logtail as LogtailService } from "@logtail/node";
import { Context, StackContextHint, ILogtailLog } from "@logtail/types";
import config from '../config';

export class Logtail extends LogtailService {
    public name?: string;

    constructor() {
        const token = config.logtail.token;

        if (!token) {
            console.error("LOGTAIL_SOURCE_TOKEN is not defined!");
            return;
        }

        super(token);
    }

    setName(name: string) {
        this.name = name;
        return this;
    }

    log<TContext extends Context>(
        message: string,
        level?: string | undefined,
        context?: TContext | undefined,
        stackContextHint?: StackContextHint | undefined
    ): Promise<ILogtailLog & TContext> {
        const name = this.name || "default";

        return super.log(`[${name}] ${message}`, level, context, stackContextHint);
    }

    debug<TContext extends Context>(
        message: string | Error,
        context?: TContext | undefined
    ): Promise<ILogtailLog & TContext> {
        const name = this.name || "default";

        return super.debug(`[${name}] ${message}`, context);
    }

    info<TContext extends Context>(
        message: string | Error,
        context?: TContext | undefined
    ): Promise<ILogtailLog & TContext> {
        const name = this.name || "default";

        return super.info(`[${name}] ${message}`, context);
    }

    warn<TContext extends Context>(
        message: string | Error,
        context?: TContext | undefined
    ): Promise<ILogtailLog & TContext> {
        const name = this.name || "default";

        return super.warn(`[${name}] ${message}`, context);
    }

    error<TContext extends Context>(
        message: string | Error,
        context?: TContext | undefined
    ): Promise<ILogtailLog & TContext> {
        const name = this.name || "default";

        return super.error(`[${name}] ${message}`, context);
    }
}

export const logtail = new Logtail();
