import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import autoload from "@fastify/autoload";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import prismaPlugin from "./plugins/prisma";
import { swaggerOpts, swaggerUiOpts } from "./utils/swagger";

import fastifyRedis from "@fastify/redis";

export function createServer(opts: FastifyServerOptions = {}): FastifyInstance {
    const app = fastify(opts).withTypeProvider<TypeBoxTypeProvider>();

    app.register(prismaPlugin);

    app.register(swagger, swaggerOpts);
    app.register(swaggerUI, swaggerUiOpts);

    app.register(autoload, {
        dir: join(__dirname, "routes"),
        options: { prefix: "/api/v1" },
        forceESM: true,
    });

    app.register(fastifyRedis);

    return app;
}
