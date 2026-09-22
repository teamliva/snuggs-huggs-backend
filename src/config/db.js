import mongoose from "mongoose";
import { env } from "./env.js";

/**
 * Mongoose connection. `strictQuery` keeps stray query keys from being
 * silently ignored, which otherwise turns a typo'd filter into a query that
 * quietly returns everything.
 */
mongoose.set("strictQuery", true);

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });

  await mongoose.connect(uri, {
    // Fail fast rather than hanging a request for 30s when the database
    // is unreachable.
    serverSelectionTimeoutMS: 8000,
  });

  const { host, name } = mongoose.connection;
  console.log(`MongoDB connected -> ${host}/${name}`);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.connection.close();
}
