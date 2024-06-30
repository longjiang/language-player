import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";

export const chatGPT = async (prompt: string, cache: boolean = true, maxTokens?: number): Promise<AxiosResponse<any>> => {
  return API.post("/chatgpt", { prompt, cache, max_tokens: maxTokens });
};