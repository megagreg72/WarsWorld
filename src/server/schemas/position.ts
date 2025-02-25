import { z } from "zod";

export const positionSchema = z.tuple([
  z.number().nonnegative(),
  z.number().nonnegative(),
]);

export type Position = z.infer<typeof positionSchema>;

export const isSamePosition = (positionA: Position, positionB: Position) =>
  positionA[0] === positionB[0] && positionA[1] === positionB[1];
