import mongoose from "mongoose";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

mongoose.set("strictQuery", true);

export async function connectDb(uri = env().MONGODB_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 15000,
    autoIndex: true
  });
  logger.info({ db: mongoose.connection.name }, "MongoDB connected");
  return mongoose.connection;
}

export async function syncIndexes() {
  for (const model of Object.values(mongoose.models)) {
    try {
      await model.createIndexes();
    } catch (err) {
      logger.warn({ model: model.modelName, err: (err as Error).message }, "index creation failed");
    }
  }
}

export function dbReady() {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
