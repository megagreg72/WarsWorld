import { coSchema } from "components/schemas/co";
import { emitEvent } from "server/emitter/event-emitter";
import {
  getNextAvailablePlayerSlot,
  getPlayerEntryInMatch,
} from "server/match-logic/server-match-logic";
import {
  MatchState,
  PlayerInMatch,
  getMatches,
  getMatchesOfPlayer,
} from "server/match-logic/server-match-states";
import { z } from "zod";
import { prisma } from "../prisma/prisma-client";
import {
  matchProcedure,
  playerProcedure,
  publicProcedure,
  router,
} from "../trpc/trpc-setup";
import { createMatchProcedure } from "./match/create";

const updateServerState = async (
  matchState: MatchState,
  newPlayersState: PlayerInMatch[],
) => {
  await prisma.match.update({
    where: {
      id: matchState.id,
    },
    data: {
      playerState: newPlayersState,
    },
  });
  matchState.players = newPlayersState;
};

const throwIfMatchNotInSetupState = (match: MatchState) => {
  if (match.status !== "setup") {
    throw new Error(
      "This action requires the match to be in 'setup' state, but it isn't",
    );
  }
};

const matchStateToFrontend = (match: MatchState) => ({
  id: match.id,
  map: {
    id: match.map.id,
    name: match.map.name,
    numberOfPlayers: match.map.numberOfPlayers,
  },
  players: match.players,
  state: match.status,
  turn: match.turn,
});

export const matchRouter = router({
  create: createMatchProcedure,
  // TODO pagination
  getAll: publicProcedure.query(() => getMatches().map(matchStateToFrontend)),
  getPlayerMatches: playerProcedure.query(({ ctx }) =>
    getMatchesOfPlayer(ctx.currentPlayer.id).map(matchStateToFrontend),
  ),
  full: matchProcedure.query(async ({ ctx }) => {
    // TODO by default show no hidden units and FoW is completely dark and empty
    // TODO if the user has a session and has a player in this match it needs to be checked and some information revealed accordingly
    return ctx.match.status;
  }),
  join: matchProcedure
    .input(
      z.object({
        selectedCO: coSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfMatchNotInSetupState(ctx.match);

      if (getPlayerEntryInMatch(ctx.match, ctx.currentPlayer.id) !== null) {
        throw new Error("You've already joined this match!");
      }

      const nextAvailablePlayerSlot = getNextAvailablePlayerSlot(ctx.match);

      await updateServerState(ctx.match, [
        ...ctx.match.players,
        {
          playerId: ctx.currentPlayer.id,
          playerSlot: nextAvailablePlayerSlot,
          ready: false,
          co: input.selectedCO,
        },
      ]);

      emitEvent({
        type: "player-joined",
        matchId: ctx.match.id,
        player: ctx.currentPlayer,
        playerSlot: nextAvailablePlayerSlot,
      });
    }),
  leave: matchProcedure.mutation(async ({ ctx }) => {
    throwIfMatchNotInSetupState(ctx.match);

    if (getPlayerEntryInMatch(ctx.match, ctx.currentPlayer.id) === null) {
      throw new Error("You can't leave this match because you haven't joined");
    }

    await updateServerState(
      ctx.match,
      ctx.match.players.filter((e) => e.playerId !== ctx.currentPlayer.id),
    );

    emitEvent({
      matchId: ctx.match.id,
      type: "player-left",
      player: ctx.currentPlayer,
    });
  }),
  setReady: matchProcedure
    .input(
      z.object({
        readyState: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfMatchNotInSetupState(ctx.match);

      if (getPlayerEntryInMatch(ctx.match, ctx.currentPlayer.id) === null) {
        throw new Error("You haven't joined this match");
      }

      await updateServerState(
        ctx.match,
        ctx.match.players.map((e) => ({
          ...e,
          ready:
            e.playerId === ctx.currentPlayer.id ? input.readyState : e.ready,
        })),
      );

      emitEvent({
        type: "player-changed-ready-status",
        matchId: ctx.match.id,
        player: ctx.currentPlayer,
        ready: input.readyState,
      });
    }),
});
