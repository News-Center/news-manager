import { FastifyInstance } from "fastify";
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
        async (request, _reply) => {
            const { title, content, tags } = request.body;

            const usernamesInterestedByTag = await prisma.user.findMany({
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
                usernames: usernamesInterestedByTag,
                content,
                title,
            };

            try {
                const result = await fastify.redis.publish("mail", JSON.stringify(object));
                fastify.log.info(`Published message to ${result} clients`);
            } catch (err: unknown) {
                if (err instanceof Error) {
                    fastify.log.error(`Error publishing message: ${err.message}`);
                } else fastify.log.error("Error publishing");
            }
        },
    );
}
