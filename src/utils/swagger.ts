import { SwaggerOptions } from "@fastify/swagger";
import type { FastifyRegisterOptions } from "fastify";

export const swaggerOpts: SwaggerOptions = {
    swagger: {
        info: {
            title: "LDAP Authenticaor API",
            description: "LDAP Authenticaor API Documentation",
            version: "0.1.0",
        },
        externalDocs: {
            url: "https://swagger.io",
            description: "Find more info here",
        },
        schemes: ["http"],
        consumes: ["application/json"],
        produces: ["application/json"],
    },
};
export const swaggerUiOpts = {
    routePrefix: "/docs",
    exposeRoute: true,
    logLevel: "warn",
} as FastifyRegisterOptions<SwaggerOptions>;
