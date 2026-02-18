import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./App.css"; // ✅ add this

import { authConfig } from "./authConfig";

const onSigninCallback = () => {
  window.history.replaceState({}, document.title, window.location.pathname);
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider {...authConfig} onSigninCallback={onSigninCallback}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
