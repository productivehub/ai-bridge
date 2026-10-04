import type { RouterInput, RouterOutput } from "../baseline.js";
import type { DialectService } from "../types.js";

export const routerDialect = {
  toBaseline: (input: RouterInput) => input,
  fromBaseline: (output: RouterOutput) => output,
} satisfies DialectService<RouterInput, RouterOutput>;
