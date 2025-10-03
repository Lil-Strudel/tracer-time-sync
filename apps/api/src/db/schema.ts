import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appStatesTable = pgTable("appStates", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  ost_group_id: text().notNull(),
  ost_api_key: text().notNull(),
  tracer_event_id: text().notNull(),
});

export const timeSyncsTable = pgTable("timeSyncs", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  tracer_entry_id: text().notNull(),
  tracer_participant_id: text().notNull(),
  tracer_station_id: text().notNull(),
  split_kind: text({ enum: ["in", "out"] }).notNull(),
  synced_at: timestamp().defaultNow().notNull(),
});

export const logsTable = pgTable("logs", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  variant: text({ enum: ["success", "error"] }).notNull(),
  message: text().notNull(),
  details: text().notNull(),
  time: timestamp().defaultNow().notNull(),
});
