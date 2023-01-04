import { FastifyInstance } from "fastify";

import { HealthSchema, HealthType } from "../../schema/health";

export default async function (fastify: FastifyInstance) {
    fastify.get<{ Reply: HealthType }>(
        "/",
        {
            schema: {
                description: "This is an endpoint for application health check",
                tags: ["health"],
                response: {
                    200: {
                        description: "Success Response",
                        ...HealthSchema
                    },
                },
            },
        },
        (_request, _reply) => {
            const healthcheck = {
                uptime: process.uptime(),
                message: "UP",
                timestamp: Date.now()
            }
            return healthcheck;
        },
    );
}
