import { TRPCError } from "@trpc/server";
import { isDevelopmentMode } from "utils/is-development-mode";
import { t } from "../trpc-init";

export const authMiddleware = t.middleware(({ next, ctx }) => {
  // if in development, anonymous is owner of 2 different players (prisma seeded)

  const user = ctx.session?.user;

  if (isDevelopmentMode) {
    return next({
      ctx: {
        user,
      },
    });
  }

  if (!user?.name) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      user: {
        ...user,
        name: user.name,
      },
    },
  });
});
