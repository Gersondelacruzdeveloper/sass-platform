import axios from "axios";
import Cookies from "js-cookie";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const csrfToken = Cookies.get("csrftoken");

  if (csrfToken) {
    config.headers["X-CSRFToken"] = csrfToken;
  }

  return config;
});

export default api;