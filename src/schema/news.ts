import { Static, Type } from "@sinclair/typebox";

export const NewsSchema = Type.Object({
    title: Type.String(),
    content: Type.String(),
    tags: Type.Union([Type.Array(Type.String()), Type.Undefined()]),
    creatorId: Type.String(),
    creationDate: Type.Date(),
});

export type NewsType = Static<typeof NewsSchema>;

export const NewsBodySchema = Type.Object({
    title: Type.String(),
    content: Type.String(),
    tags: Type.Array(Type.String()),
    creatorId: Type.String(),
    creationDate: Type.Date(),
});

export type NewsBodyType = Static<typeof NewsBodySchema>;

export const NewsResponseSchema = Type.Object({
    receivers: Type.Array(Type.String()),
});

export type NewsResponseType = Static<typeof NewsResponseSchema>;
