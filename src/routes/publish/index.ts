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
            const { title, content, tags } = request.body;

            const payload = {
                title,
                content,
                // Note: handle is essentially the username
                handle: "",
            };

            const channelsToTag = await prisma.user.findMany({
                select: {
                    channels: {
                        select: {
                            handle: true,
                            channel: true,
                        },
                    },
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

            const handlers = [];

            try {
                for (let i = 0; i < channelsToTag.length; i++) {
                    const currentChannels = channelsToTag[i].channels;

                    for (let j = 0; j < currentChannels.length; j++) {
                        const currentChannel = currentChannels[j];
                        const handle = currentChannel.handle;
                        const channelUrl = currentChannel.channel.url;

                        payload.handle = handle;

                        const url = channelUrl + "publish";
                        fastify.log.info(`POST to: ${url}`);

                        const result = await axios.post(url, JSON.stringify(payload), {
                            headers: {
                                "Content-Type": "application/json",
                            },
                            timeout: 3000,
                        });

                        if (result.status == 200) {
                            const msg = `Published message to ${payload.handle} via ${currentChannel.channel.name}`;
                            fastify.log.info(msg);
                            handlers.push(handle);
                        } else {
                            fastify.log.warn(`Status code was not 200: ${result.status}`);
                        }
                    }
                }

                return reply.status(200).send({ receivers: handlers });
            } catch (err: unknown) {
                if (err instanceof Error) {
                    fastify.log.error(`Error publishing message: ${err.message}`);
                } else fastify.log.error("Error publishing");

                return reply.status(400).send({ error: "Error publishing" });
            }
        },
    );
}
