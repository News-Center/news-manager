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

            const usernames = new Set<string>();

            for (const tag of tags) {
                const users = await prisma.tag.findMany({
                    where: {
                        value: tag,
                    },
                    select: {
                        User: true,
                    },
                });

                users.forEach(user => {
                    usernames.add(user.User[0].username);
                });
            }

            const object = {
                usernames: Array.from(usernames),
                content,
                title,
            };
            fastify.redis.publish("mail", JSON.stringify(object));
        },
    );
}
