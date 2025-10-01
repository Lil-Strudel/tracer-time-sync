import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const racesTable = pgTable("races", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
});

export const raceAidStationsTable = pgTable("races", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
});

export const timeSyncsTable = pgTable("timeSyncs", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tracer_entry_id: text().notNull(),
  tracer_participant_id: text().notNull(),
  tracer_station_id: text().notNull(),
  split_kind: text({ enum: ["in", "out"] }).notNull(),
  synced_at: timestamp().defaultNow().notNull(),
});
