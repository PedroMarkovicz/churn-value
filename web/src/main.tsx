import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/index.css";

function App() {
  return <h1 className="font-serif text-4xl">churn-value</h1>;
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
