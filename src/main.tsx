import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./app.css";
import "./specimen.css";
import { fontFaceCss } from "./render";
const style = document.createElement("style");
style.textContent = fontFaceCss();
document.head.appendChild(style);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
