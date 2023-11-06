import { FastifyInstance } from "fastify";
import axios from "axios";
import Fuse from "fuse.js";

import { NewsBodyType, NewsResponseSchema } from "../../schema/news";

const synonymsCache: Map<string, string[]> = new Map<string, string[]>();

export default async function (fastify: FastifyInstance) {
    // function scheduleDelivery(channelsToTag: any, payload: any, url: string) {
    //     let startDate: Date = channelsToTag.startDate;
    //     let endDate: Date = channelsToTag.endDate;
    //
    //     let startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    //     let endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    //
    //     let timeToSendMinutes = Math.floor(Math.random() * (endMinutes - startMinutes + 1) + startMinutes)
    //     let hours = Math.floor(timeToSendMinutes / 60);
    //     let minutes = timeToSendMinutes % 60;
    //
    //     schedule.scheduleJob(minutes + ' ' + hours + ' * * *', function () {
    //         sendMessage(url, payload);
    //     });
    //
    //     async function sendMessage(url: string, payload: any) {
    //         const result = await axios.post(url, JSON.stringify(payload), {
    //             headers: {
    //                 "Content-Type": "application/json",
    //             },
    //             timeout: 10000,
    //         });
    //
    //         if (result.status == 200) {
    //             const msg = `Published message to ${payload.handle}`;
    //             fastify.log.info(msg);
    //         } else {
    //             fastify.log.warn(`Status code was not 200: ${result.status}`);
    //         }
    //     }
    // }

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
            let synonyms = data.synsets.flatMap((synset: any) => synset.terms.map((term: any) => term.term));
            synonyms = synonyms.map((synonym: string) => synonym.toLowerCase());

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

    const removeDuplicates = (users: any[]) => {
        const seen = new Set();
        const uniqueUsers = [];
        for (const user of users.flat()) {
            if (!seen.has(user.id)) {
                seen.add(user.id);
                uniqueUsers.push(user);
            }
        }
        return uniqueUsers;
    };

    const fetchPhases = async () => {
        try {
            const response = await axios.get("http://user_api:8080/api/v1/phase");
            const phases = response.data.phases;

            if (phases.length !== 4) {
                throw new Error("There must be exactly 4 phases. Implement 4 phases!");
            }

            return phases;
        } catch (error) {
            fastify.log.error(error);
            throw error;
        }
    };

    async function retrieveUsersForPhase(tags: string[], phaseId: number) {
        const channelsToTagByPhase = [];

        const users = await prisma.user.findMany({
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
                phases: {
                    some: {
                        id: {
                            in: phaseId,
                        },
                    },
                },
            },
        });
        if (users.length > 0) {
            channelsToTagByPhase.push(users);
        }

        return channelsToTagByPhase;
    }

    async function getNormalUsers(tags: string[]) {
        return await prisma.user.findMany({
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
    }

    async function getUsersFromPhases(tagsForPhase: Map<number, string[]>) {
        const phases = await fetchPhases();
        const usersFromPhases = [];

        for (const phase of phases) {
            if (tagsForPhase.has(phase.id)) {
                const tags = tagsForPhase.get(phase.id) as string[];

                const phaseUsers = await retrieveUsersForPhase(tags, phase.id);
                fastify.log.info(`Users found in phase ${phase.id}: ${phaseUsers.length}`);
                usersFromPhases.push(phaseUsers);
            }
        }
        return usersFromPhases;
    }

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
            const { title, content, tags, creatorId, creationDate } = request.body;
            fastify.log.info(`News with creatorId: ${creatorId}`);
            fastify.log.info(`News with creationDate: ${creationDate}`);

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

            // Phase with ID 1
            const fuzzySearchTags = fuzzySearchTagsFromText(title, content, allTags, 0.2);
            fastify.log.info(`Phase 1: fuzzySearchTags: ${fuzzySearchTags}`);

            // Phase with ID 2
            const synonymTags = await getAllSynonyms(allTags).catch(err => {
                fastify.log.error(err);
            });
            let fuzzySearchSynonymTags = fuzzySearchTagsFromText(title, content, synonymTags, 0.1);
            fuzzySearchSynonymTags = fuzzySearchSynonymTags.map(tag => tag.toLowerCase());
            fastify.log.info(`Phase 2: fuzzySearchSynonymTags: ${fuzzySearchSynonymTags}`);

            // Phase with ID 3
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
            fastify.log.info(`Phase 3: fuzzySearchLdapTags: ${fuzzySearchLdapTags}`);

            // Phase with ID 4
            const synonymLdapTags = await getAllSynonyms(ldapTags).catch(err => {
                fastify.log.error(err);
            });
            let fuzzySearchSynonymLdapTags = fuzzySearchTagsFromText(title, content, synonymLdapTags, 0.1);
            fuzzySearchSynonymLdapTags = fuzzySearchSynonymLdapTags.map(tag => tag.toLowerCase());
            fastify.log.info(`Phase 4: fuzzySearchSynonymLdapTags: ${fuzzySearchSynonymLdapTags}`);

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

            const users = await getNormalUsers(tags);
            fastify.log.info(`=======================`);
            fastify.log.info(`Normal users: ${users.length}`);

            // Map phase ID to tags
            const tagsForPhase: Map<number, string[]> = new Map<number, string[]>([
                [1, fuzzySearchTags],
                [2, fuzzySearchSynonymTags],
                [3, fuzzySearchLdapTags],
                [4, fuzzySearchSynonymLdapTags],
            ]);

            const usersFromPhases = await getUsersFromPhases(tagsForPhase);

            const allChannelsToTagByPhase = [...new Set([...users, ...usersFromPhases])];
            const channelsToTag = removeDuplicates(allChannelsToTagByPhase);

            fastify.log.info(`channelsToTag: ${channelsToTag.length}`);
            fastify.log.info(`=======================`);

            const handlers = [];

            try {
                for (let i = 0; i < channelsToTag.length; i++) {
                    const currentChannels = channelsToTag[i].channels;

                    for (let j = 0; j < currentChannels.length; j++) {
                        const currentChannel = currentChannels[j];
                        const handle = currentChannel.handle;
                        const channelUrl = currentChannel.channel.url;

                        payload.handle = handle;

                        // scheduleDelivery(channelsToTag, payload, channelUrl);
                        //
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
                    err.stack && fastify.log.error(err.stack);
                    fastify.log.error(`Error publishing message: ${err.message}`);
                } else fastify.log.error("Error publishing");

                return reply.status(400).send({ error: "Error publishing" });
            }
        },
    );
}
