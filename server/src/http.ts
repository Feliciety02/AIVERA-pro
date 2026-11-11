import type { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

/** Validates a request body against a Zod schema (400 on failure). */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export const me = (req: Request) => req.user!;

/** Route param as a plain string (Express 5 types allow arrays for wildcard params). */
export const param = (req: Request, key = "id"): string => {
  const v = req.params[key];
  return Array.isArray(v) ? v.join("/") : String(v ?? "");
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid request", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
