import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "./server/vercel-app.js";

const app = createApp(express());
const publicDirectory = path.resolve(process.cwd(), "public");
const indexFile = path.join(publicDirectory, "index.html");

app.get("*", (req, res) => {
  const requestedFile = path.resolve(publicDirectory, `.${decodeURIComponent(req.path)}`);
  if (
    requestedFile.startsWith(`${publicDirectory}${path.sep}`) &&
    fs.existsSync(requestedFile) &&
    fs.statSync(requestedFile).isFile()
  ) {
    res.sendFile(requestedFile);
    return;
  }
  res.sendFile(indexFile);
});

export default app;