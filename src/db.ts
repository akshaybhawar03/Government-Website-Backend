import mongoose from "mongoose";
import { env } from "./env.js";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCacheBackend: MongooseCache | undefined;
}

const globalCache = globalThis.__mongooseCacheBackend ?? { conn: null, promise: null };

export async function connectToDatabase() {
  if (globalCache.conn) return globalCache.conn;

  if (!globalCache.promise) {
    globalCache.promise = mongoose.connect(env.MONGODB_URI, {
      bufferCommands: false,
    });
  }

  globalCache.conn = await globalCache.promise;
  globalThis.__mongooseCacheBackend = globalCache;
  return globalCache.conn;
}
