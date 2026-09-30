import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { makeRouter } from "@/routes.tsx";

import "@/styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={makeRouter()} />
  </StrictMode>,
);
