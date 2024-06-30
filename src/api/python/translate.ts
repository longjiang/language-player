import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";

export const translateText = async (text: string, l1: string, l2: string): Promise<AxiosResponse<any>> => {
  return API.post("/translate", { text, l1, l2 });
};

export const translateTextGet = async (text: string, l1: string, l2: string): Promise<AxiosResponse<any>> => {
  return API.get("/translate", { params: { text, l1, l2 } });
};

export const translateTextArray = async (texts: string[], l1: string, l2: string): Promise<AxiosResponse<any>> => {
  return API.post("/translate_array", { texts, l1, l2 });
};

export const translateVideoAndSave = async (l1: string, l2: string, videoId: string): Promise<AxiosResponse<any>> => {
  return API.get("/translate_video_and_save", { params: { l1, l2, video_id: videoId } });
};
