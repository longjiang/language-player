import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";

export const getUserLikes = async (id: string, langCode: string): Promise<AxiosResponse<any>> => {
  return API.post("/user-likes", { id, l2: langCode });
};

export const getUserWatchHistory = async (id: string, langCode: string): Promise<AxiosResponse<any>> => {
  return API.post("/user-watch-history", { id, l2: langCode });
};
