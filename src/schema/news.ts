import { Static, Type } from "@sinclair/typebox";

export const NewsSchema = Type.Object({
    title: Type.String(),
    content: Type.String(),
    tags: Type.Union([Type.Array(Type.String()), Type.Undefined()]),
});

export type NewsType = Static<typeof NewsSchema>;

export const NewsBodySchema = Type.Object({
    title: Type.String(),
    content: Type.String(),
    tags: Type.Array(Type.String()),
});

export type NewsBodyType = Static<typeof NewsBodySchema>;

export const NewsResponseSchema = Type.Object({
    news: Type.Union([NewsSchema, Type.Null()]),
});

export type NewsResponseType = Static<typeof NewsResponseSchema>;
