import { Static, Type } from "@sinclair/typebox";

export const HealthSchema = Type.Object({
    uptime: Type.Number(),
    message: Type.String(),
    timestamp: Type.Number()
});

export type HealthType = Static<typeof HealthSchema>;
