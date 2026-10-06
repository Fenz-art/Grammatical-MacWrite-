import "dotenv/config";
import express from "express";
import path from "node:path";
import { createApp } from "./server/vercel-app.js";

const app = createApp(express());

app.get("*", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
});

export default app;