import { FastifyInstance } from "fastify";
import {
    ChannelBodyType,
    ChannelBodySchema,
    ChannelResponseSchema,
    ChannelsResponseType,
    ChannelsSchema,
} from "../../schema/channel";
import axios from "axios";

export default async function (fastify: FastifyInstance) {
    const { prisma } = fastify;

    fastify.get<{ Reply: ChannelsResponseType }>(
        "/",
        {
            schema: {
                description: "Return all available channels",
                tags: ["channel"],
                response: {
                    200: {
                        description: "Successful response",
                        ...ChannelsSchema,
                    },
                },
            },
        },
        async (_, _reply) => {
            const channels = await prisma.channel.findMany({
                include: {
                    users: false,
                },
            });

            return { channels };
        },
    );

    fastify.post<{ Body: ChannelBodyType }>(
        "/",
        {
            schema: {
                description: "",
                tags: ["channel"],
                body: ChannelBodySchema,
                response: {
                    200: {
                        description: "Regsiter Client",
                        ...ChannelResponseSchema,
                    },
                },
            },
        },
        async (request, reply) => {
            // Discord
            // localhost:870185
            const { name, url } = request.body;

            if (!url || !name) {
                reply.status(400).header("Conent-Type", "application/json").send({ msg: "idk" });
            }

            try {
                const healthCheckResponse = await axios.get(`${url}/health`);

                if (healthCheckResponse.status === 200) {
                    const registeredClient = await prisma.channel.upsert({
                        where: { name },
                        update: {},
                        create: { name, url },
                    });

                    reply.status(201).send({ channel: registeredClient });
                }
            } catch (error) {
                fastify.log.error("Health check failed: ", (error as Error).message);
            }

            reply.status(400).send({ error: "Failed to register client" });
        },
    );
}
