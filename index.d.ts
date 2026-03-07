import { FastifyPluginAsync } from "fastify";

export interface YlogOptions {
    /**
     * The log level to emit.
     * @default 'info'
     */
    level?: string;
    /**
     * Prettify logs suitable for standard output development.
     * @default false
     */
    pretty?: boolean;
}

export const ylog: FastifyPluginAsync<YlogOptions>;
export default ylog;
