import { timestamp, uuid } from "drizzle-orm/pg-core";

export const ts = (opts: { notNull?: boolean } = {}) =>
  opts.notNull ? timestamp({ withTimezone: true }).notNull() : timestamp({ withTimezone: true });

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const pk = () => uuid().primaryKey().defaultRandom();
