import { Static, Type } from "@sinclair/typebox";

export const ChannelSchema = Type.Object({
    id: Type.Integer(),
    name: Type.String(),
    createdAt: Type.Optional(Type.Union([Type.String(), Type.Date()])),
    updatedAt: Type.Optional(Type.Union([Type.String(), Type.Date()])),
    url: Type.String(),
});

export type ChannelType = Static<typeof ChannelSchema>;

export const ChannelBodySchema = Type.Object({
    name: Type.String(),
    url: Type.String(),
});

export type ChannelBodyType = Static<typeof ChannelBodySchema>;

export const ChannelResponseSchema = Type.Object({
    channel: Type.Union([ChannelSchema, Type.Null()]),
});

export type ChannelResponseType = Static<typeof ChannelResponseSchema>;

export const ChannelsSchema = Type.Union([
    Type.Object({
        channels: Type.Array(ChannelSchema),
    }),
    Type.Null(),
]);

export type ChannelsResponseType = Static<typeof ChannelsSchema>;
