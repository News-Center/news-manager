import { FastifyInstance } from "fastify";
import axios from "axios";
import Fuse from "fuse.js";

import { NewsBodyType, NewsResponseSchema } from "../../schema/news";

const synonymsCache: Map<string, string[]> = new Map<string, string[]>();

export default async function (fastify: FastifyInstance) {
    function fuzzySearchTagsFromText(title: string, content: string, allTags: any, threshold: number) {
        const searchTargets = [title, ...content.split(" ")];
        const options = {
            shouldSort: true,
            includeScore: true,
            isCaseSensitive: true,
            threshold: threshold,
            ignoreLocation: true,
        };
        const fuse = new Fuse(searchTargets, options);

        const relevantTags: string[] = [];

        if (allTags instanceof Map) {
            // We are dealing with a map of synonyms
            allTags.forEach((synonymTags, tag) => {
                for (const synonymTag of synonymTags) {
                    const searchResults = fuse.search(synonymTag);
                    const additionalTags = searchResults.map(result => result.item);

                    if (additionalTags.length > 0) {
                        fastify.log.info(`Found synonym "${synonymTag}" for tag "${tag}"`);
                        // Push actual tag instead of synonym
                        relevantTags.push(tag);
                        // Synonym found, no need to check other synonyms
                        break;
                    }
                }
            });

            return relevantTags;
        }

        for (const tag of allTags) {
            const searchResults = fuse.search(tag);
            const additionalTags = searchResults.map(result => result.item);

            if (additionalTags.length > 0) {
                relevantTags.push(tag);
            }
        }

        return relevantTags;
    }

    async function getSynonyms(word: string): Promise<string[]> {
        const fromCache = synonymsCache.get(word);
        if (fromCache) {
            fastify.log.info(`Synonyms for ${word} found in cache: ${fromCache}`);
            return fromCache;
        }

        const apiUrl = `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(
            word,
        )}&format=application/json`;

        try {
            const response = await axios.get(apiUrl);
            const data = response.data;
            const synonyms = data.synsets.flatMap((synset: any) => synset.terms.map((term: any) => term.term));

            synonymsCache.set(word, synonyms);

            return synonyms;
        } catch (error) {
            throw new Error("Failed to fetch synonyms");
        }
    }

    async function getAllSynonyms(words: string[]): Promise<Map<string, string[]>> {
        const synonymsMap = new Map<string, string[]>();

        const synonymsPromises = words.map(async word => {
            return getSynonyms(word).then(synonyms => {
                synonymsMap.set(word, synonyms);
            });
        });

        if (words.length >= 59) {
            // Delay for 1 second between each request (because of API rate limit)
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            await Promise.all(synonymsPromises);
        }

        return synonymsMap;
    }

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

            // Exclude ldapTags from initial detection
            const allTagsData = await prisma.tag.findMany({
                select: {
                    value: true,
                },
                where: {
                    isLdap: false,
                },
            });
            const allTags = allTagsData.map(tagData => tagData.value);

            const fuzzySearchTags = fuzzySearchTagsFromText(title, content, allTags, 0.2);
            fastify.log.info(`fuzzySearchTags: ${fuzzySearchTags}`);

            const synonymTags = await getAllSynonyms(allTags).catch(err => {
                fastify.log.error(err);
            });
            const fuzzySearchSynonymTags = fuzzySearchTagsFromText(title, content, synonymTags, 0.1);
            fastify.log.info(`fuzzySearchSynonymTags: ${fuzzySearchSynonymTags}`);

            // Include ldapTags and their synonyms in a separate detection
            const ldapTagsData = await prisma.tag.findMany({
                select: {
                    value: true,
                },
                where: {
                    isLdap: true,
                },
            });
            const ldapTags = ldapTagsData.map(tagData => tagData.value);

            const fuzzySearchLdapTags = fuzzySearchTagsFromText(title, content, ldapTags, 0.1);
            fastify.log.info(`fuzzySearchLdapTags: ${fuzzySearchLdapTags}`);

            const synonymLdapTags = await getAllSynonyms(ldapTags).catch(err => {
                fastify.log.error(err);
            });
            const fuzzySearchSynonymLdapTags = fuzzySearchTagsFromText(title, content, synonymLdapTags, 0.1);
            fastify.log.info(`fuzzySearchSynonymLdapTags: ${fuzzySearchSynonymLdapTags}`);

            let finalTags = [
                ...fuzzySearchLdapTags,
                ...fuzzySearchSynonymLdapTags,
                ...fuzzySearchSynonymTags,
                ...fuzzySearchTags,
                ...tags,
            ];
            // Remove duplicates
            finalTags = [...new Set(finalTags)];
            fastify.log.info(`finalTags: ${finalTags}`);

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
                                in: finalTags,
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

                        const url = channelUrl + "/publish";
                        fastify.log.info(`POST to: ${url}`);

                        const result = await axios.post(url, JSON.stringify(payload), {
                            headers: {
                                "Content-Type": "application/json",
                            },
                            timeout: 10000,
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
