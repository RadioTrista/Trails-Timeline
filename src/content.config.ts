import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const dateSchema = z.object({
	year: z.number().int(),
	month: z.number().int().min(1).max(12).optional(),
	day: z.number().int().min(1).max(31).optional(),
	precision: z.enum(["day", "month", "year"]),
});

const events = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/events" }),
	schema: z.object({
		title: z.string(),
		date: dateSchema,
		spoilerTier: z.number().int().min(0).default(0),
		summary: z.string(),
	}),
});

export const collections = { events };
