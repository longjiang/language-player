import axios, { AxiosInstance } from "axios";

export const PYTHON_SERVER = 'https://python.zerotohero.ca'; // Replace with your server URL

export const API: AxiosInstance = axios.create({
  baseURL: PYTHON_SERVER,
});


