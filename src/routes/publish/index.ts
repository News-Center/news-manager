import { FastifyInstance } from "fastify";
import axios from "axios";

import { NewsBodyType, NewsResponseSchema } from "../../schema/news";

export default async function (fastify: FastifyInstance) {
    const { prisma } = fastify;

    fastify.post<{ Body: NewsBodyType }>(
        "/",
        {
            schema: {
                description: "",
                tags: ["publish"],
                response: {
                    200: {
                        description: "Receive created message",
                        ...NewsResponseSchema,
                    },
                },
            },
        },
        async (request, reply) => {
            const { title, content, tags, medium } = request.body;

            // TODO: make use of 3rd table UserOnChannel to get the correct handles

            const usernamesSubscribedToTag = await prisma.user.findMany({
                select: {
                    username: true,
                },
                where: {
                    tags: {
                        some: {
                            value: {
                                in: tags,
                            },
                        },
                    },
                },
            });

            const object = {
                usernames: usernamesSubscribedToTag,
                content,
                title,
            };

            try {
                const channel = await prisma.channel.findUnique({ where: { name: medium } });

                if (!channel) {
                    return reply.status(400).send({ error: "Could not find channel with name: " + medium });
                }

                const result = await axios.post(channel.url, JSON.stringify(object));
                fastify.log.info(`Published message to ${result} clients`);
                return reply.status(200).send({ msg: `Published message to ${result} clients` });
            } catch (err: unknown) {
                if (err instanceof Error) {
                    fastify.log.error(`Error publishing message: ${err.message}`);
                } else fastify.log.error("Error publishing");

                return reply.status(400).send({ error: "Error publishing" });
            }
        },
    );
}
