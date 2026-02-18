// src/apiConfig.js
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://xeyj3gieud.execute-api.us-east-2.amazonaws.com";

export const EXPENSES_URL = `${API_BASE_URL}/expenses`;
