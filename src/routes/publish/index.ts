import { FastifyInstance } from "fastify";
import axios from "axios";
import Fuse from "fuse.js";
import schedule from "node-schedule";
import { NewsBodyType, NewsResponseSchema } from "../../schema/news";
import OpenAI from "openai";
import "dotenv/config";
import { Config } from "../../config";

const synonymsCache: Map<string, string[]> = new Map<string, string[]>();

export default async function (fastify: FastifyInstance) {
    async function sendMessage(channelUrl: string, payload: any) {
        const url = channelUrl + "/publish";
        fastify.log.info(`POST to: ${url}`);

        const result = await axios.post(url, JSON.stringify(payload), {
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 10000,
        });

        if (result.status == 200) {
            const msg = `Published message to ${payload.handle}`;
            fastify.log.info(msg);
        } else {
            fastify.log.warn(`Status code was not 200: ${result.status}`);
        }
    }

    function scheduleDelivery(channelsToTag: any, payload: any, url: string) {
        fastify.log.info(channelsToTag);
        const startDate: Date = channelsToTag.preferredStartTime;
        const endDate: Date = channelsToTag.preferredEndTime;

        const startHours = startDate.getHours();
        const startMinutes = startDate.getMinutes();

        const endHours = endDate.getHours();
        const endMinutes = endDate.getMinutes();

        fastify.log.info(
            `User has preferred start time: ${startHours}:${startMinutes} and preferred end time: ${endHours}:${endMinutes}`,
        );

        const rndHours = Math.floor(Math.random() * (endHours - startHours + 1) + startHours);
        const rndMinutes = Math.floor(Math.random() * (endMinutes - startMinutes + 1) + startMinutes);

        fastify.log.info(`Time to deliver message ${rndHours}:${rndMinutes} to ${payload.handle}`);

        schedule.scheduleJob(rndMinutes + " " + rndHours + " * * *", function () {
            sendMessage(url, payload);
        });
    }

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
            const synonyms1 = getSynonyms(word).catch(() => {
                fastify.log.warn(`Failed to fetch synonyms for ${word}`);
                return [];
            });

            return synonyms1.then(synonyms => {
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

    function hammingDistance(s1: string, s2: string): number {
        const lengthDifference = Math.abs(s1.length - s2.length);

        let distance = 0;
        const minLength = Math.min(s1.length, s2.length);

        for (let i = 0; i < minLength; i++) {
            if (s1[i] !== s2[i]) {
                distance++;
            }
        }

        distance += lengthDifference;

        return distance;
    }

    function searchTagsFromTextWithHamming(
        title: string,
        content: string,
        allTags: string[] | Map<string, string[]>,
        threshold: number,
    ): string[] {
        const searchTargets = [title, ...content.split(" ")];
        const relevantTags: string[] = [];

        if (allTags instanceof Map) {
            // We are dealing with a map of synonyms
            allTags.forEach((synonymTags, tag) => {
                for (const synonymTag of synonymTags) {
                    for (const currentWord of searchTargets) {
                        if (hammingDistance(synonymTag, currentWord) <= threshold) {
                            fastify.log.info(`Found synonym "${synonymTag}" for tag "${tag}"`);
                            relevantTags.push(tag);
                            break;
                        }
                    }
                }
            });

            return relevantTags;
        }

        for (const tag of allTags) {
            for (const currentWord of searchTargets) {
                if (hammingDistance(tag, currentWord) <= threshold) {
                    relevantTags.push(tag);
                    break;
                }
            }
        }

        return relevantTags;
    }

    const makeRequestToOpenAI = async (content: string, tags: string[]) => {
        const openAI = new OpenAI({ apiKey: Config.openApiKey });

        const completion = await openAI.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content:
                        "Du bist ein Tag Erkennungssystem, das einen Satz auf seinen Kontext analysiert und dann anhand des Kontextes die zutreffendsten Tags von den mitgegebenen Tags zurückliefert, du darfst nur die mitgegebenen Tags benutzen, keine eigenen Tags erzeugen. Form der Ausgabe: Tags:[tags]",
                },
                { role: "user", content: "Der Satz:" + content + "Tags:" + tags },
            ],
            model: "gpt-3.5-turbo-0613",
        });

        return completion.choices[0].message.content;
    };

    async function searchTagsFromTextWithAPI(title: string, content: string, allTags: string[]): Promise<string[]> {
        // const searchTargets = [title, ...content.split(" ")];
        const relevantTags: string[] = [];

        const message = await makeRequestToOpenAI(content, allTags); // await here

        allTags.forEach(tag => {
            if (message?.includes(tag)) {
                relevantTags.push(tag.toString());
            }
        });

        return relevantTags;
    }

    const { prisma } = fastify;

    const removeDuplicates = (users: any[]) => {
        const seen = new Set();
        const uniqueUsers = [];
        for (const user of users) {
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
            return response.data.phases;
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
                id: true,
                preferredStartTime: true,
                preferredEndTime: true,
                likes: true,
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
                id: true,
                preferredStartTime: true,
                preferredEndTime: true,
                likes: true,
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

    async function getUsersFromPhases(tagsForPhase: Map<number, string[]>, amountOfImplementedPhases: number) {
        const phases = await fetchPhases();

        if (phases.length !== amountOfImplementedPhases) {
            throw new Error(
                `Amount of implemented phases (${amountOfImplementedPhases}) does not match with the amount of saved phases (${phases.length})!`,
            );
        }

        const usersFromPhases = [];

        for (const phase of phases) {
            if (tagsForPhase.has(phase.id)) {
                const tags = tagsForPhase.get(phase.id) as string[];

                const phaseUsers = await retrieveUsersForPhase(tags, phase.id);

                let foundEntriesLength = 0;
                if (phaseUsers.length > 0) {
                    if (phaseUsers[0].length > 0) {
                        foundEntriesLength = phaseUsers[0].length;
                    }
                }

                fastify.log.info(`Users found in phase ${phase.id}: ${foundEntriesLength}`);

                usersFromPhases.push(phaseUsers);
            }
        }
        return usersFromPhases.flat();
    }

    async function getTagsByIsLdap(isLdap: boolean): Promise<string[]> {
        const tagsData = await prisma.tag.findMany({
            select: {
                value: true,
            },
            where: {
                isLdap,
            },
        });
        return tagsData.map(tagData => tagData.value.toLowerCase());
    }

    async function getUsersByLikedMessages(usersThatWillReceiveNews: any[]) {
        const allUsers = await prisma.user.findMany({
            select: {
                channels: {
                    select: {
                        handle: true,
                        channel: true,
                    },
                },
                id: true,
                preferredStartTime: true,
                preferredEndTime: true,
                likes: true,
            },
        });

        const interestedUsers = [];

        for (let i = 0; i < usersThatWillReceiveNews.length; i++) {
            const userThatWillReceiveNews = usersThatWillReceiveNews[i];

            for (let j = 0; j < allUsers.length; j++) {
                const user = allUsers[j];

                if (userThatWillReceiveNews.id === user.id) {
                    // If the user is the same as the user that will receive the news, skip
                    continue;
                }

                if (usersThatWillReceiveNews.map((user: any) => user.id).includes(user.id)) {
                    // If the user is already in the list of users that will receive the news, skip
                    continue;
                }

                const commonLikes = user.likes.filter((like: any) => {
                    if (userThatWillReceiveNews.likes.length === 0) {
                        return false;
                    }

                    if (like === null || like === undefined || like === "") {
                        return false;
                    }

                    return userThatWillReceiveNews.likes.includes(like);
                });

                if (commonLikes.length > 0) {
                    fastify.log.info(
                        `User ${user.id} has common likes with user ${userThatWillReceiveNews.id}: ${commonLikes}`,
                    );

                    interestedUsers.push(user);
                }
            }
        }

        return removeDuplicates(interestedUsers);
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
            let { title, content, tags, creatorId, creationDate } = request.body; // eslint-disable-line
            title = title.toLowerCase();
            content = content.toLowerCase();

            fastify.log.info(`News with creatorId: ${creatorId}`);
            fastify.log.info(`News with creationDate: ${creationDate}`);

            const payload = {
                title,
                content,
                // Note: handle is essentially the username
                handle: "",
            };

            // Exclude ldapTags from initial detection
            const allTags = await getTagsByIsLdap(false);

            // Phase with ID 1
            const fuzzySearchTags = fuzzySearchTagsFromText(title, content, allTags, 0.2);
            fastify.log.info(`Phase 1: fuzzySearchTags: ${fuzzySearchTags}`);

            // Phase with ID 2
            const synonymTags = await getAllSynonyms(allTags).catch(err => {
                fastify.log.error(err);
                return [];
            });
            let fuzzySearchSynonymTags = fuzzySearchTagsFromText(title, content, synonymTags, 0.1);
            fuzzySearchSynonymTags = fuzzySearchSynonymTags.map(tag => tag.toLowerCase());
            fastify.log.info(`Phase 2: fuzzySearchSynonymTags: ${fuzzySearchSynonymTags}`);

            // Phase with ID 3
            // Include ldapTags and their synonyms in a separate detection
            const ldapTags = await getTagsByIsLdap(true);

            const fuzzySearchLdapTags = fuzzySearchTagsFromText(title, content, ldapTags, 0.1);
            fastify.log.info(`Phase 3: fuzzySearchLdapTags: ${fuzzySearchLdapTags}`);

            // Phase with ID 4
            const synonymLdapTags = await getAllSynonyms(ldapTags.slice(0, 100)).catch(err => {
                fastify.log.error(err);
            });
            let fuzzySearchSynonymLdapTags = fuzzySearchTagsFromText(title, content, synonymLdapTags, 0.1);
            fuzzySearchSynonymLdapTags = fuzzySearchSynonymLdapTags.map(tag => tag.toLowerCase());
            fastify.log.info(`Phase 4: fuzzySearchSynonymLdapTags: ${fuzzySearchSynonymLdapTags}`);

            // Phase with ID 5
            const hammingTags = searchTagsFromTextWithHamming(title, content, allTags, 1);
            fastify.log.info(`Phase 5: hammingTags: ${hammingTags}`);

            // Phase with ID 6
            let hammingSynonymTags = searchTagsFromTextWithHamming(title, content, synonymTags, 1);
            hammingSynonymTags = hammingSynonymTags.map(tag => tag.toLowerCase());
            fastify.log.info(`Phase 6: hammingSynonymTags: ${fuzzySearchSynonymTags}`);

            // Phase with ID 7
            const apiTags = await searchTagsFromTextWithAPI(title, content, allTags);
            fastify.log.info(`Phase 7: apiTags: ${apiTags}`);

            let finalTags = [
                ...fuzzySearchLdapTags,
                ...fuzzySearchSynonymLdapTags,
                ...fuzzySearchSynonymTags,
                ...fuzzySearchTags,
                ...hammingTags,
                ...hammingSynonymTags,
                ...apiTags,
                ...tags,
            ];

            // Remove duplicates
            finalTags = [...new Set(finalTags)];
            fastify.log.info(`finalTags: ${finalTags}`);

            const users = await getNormalUsers(tags);
            fastify.log.info(`=======================`);
            fastify.log.info(`Normal users: ${users.length}`);

            // Map phase ID to tags
            const tagToPhase: Map<number, string[]> = new Map<number, string[]>([
                [1, fuzzySearchTags],
                [2, fuzzySearchSynonymTags],
                [3, fuzzySearchLdapTags],
                [4, fuzzySearchSynonymLdapTags],
                [5, hammingTags],
                [6, hammingSynonymTags],
                [7, apiTags],
            ]);

            const usersFromPhases = await getUsersFromPhases(tagToPhase, tagToPhase.size);

            const allChannelsToTagByPhase = [...users, ...usersFromPhases].flat();
            let usersThatWillReceiveNews = removeDuplicates(allChannelsToTagByPhase);

            // This approach takes into account the likes of the users instead of the tags
            const interestedUsers = await getUsersByLikedMessages(usersThatWillReceiveNews);
            fastify.log.info(`Users from common likes: ${interestedUsers.length}`);

            usersThatWillReceiveNews = removeDuplicates([...usersThatWillReceiveNews, ...interestedUsers]);

            fastify.log.info(`Unique final users: ${usersThatWillReceiveNews.length}`);
            fastify.log.info(`=======================`);

            fastify.log.info(`normalUsers: ${JSON.stringify(users)}`);
            fastify.log.info(`usersFromPhases: ${JSON.stringify(users)}`);
            fastify.log.info(`unique usersThatWillReceiveNews: ${JSON.stringify(usersThatWillReceiveNews)}`);

            const handlers = [];
            try {
                for (let i = 0; i < usersThatWillReceiveNews.length; i++) {
                    const currentChannels = usersThatWillReceiveNews[i].channels;
                    fastify.log.info(`currentChannels: ${JSON.stringify(currentChannels)}`);

                    if (currentChannels == undefined) {
                        continue;
                    }

                    for (let j = 0; j < currentChannels.length; j++) {
                        const currentChannel = currentChannels[j];
                        const handle = currentChannel.handle;
                        const channelUrl = currentChannel.channel.url;

                        payload.handle = handle;

                        scheduleDelivery(usersThatWillReceiveNews[i], payload, channelUrl);
                        handlers.push(handle);
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
