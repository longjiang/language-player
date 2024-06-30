import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";

export const sendVerificationEmail = async (email: string): Promise<AxiosResponse<any>> => {
  return API.post("/verification_email", { email });
};

export const verifyEmailCode = async (email: string, code: string, acquisitionSource?: string, acquisitionDetails?: string): Promise<AxiosResponse<any>> => {
  return API.post("/verification_email/verify", { email, code, acquisition_source: acquisitionSource, acquisition_details: acquisitionDetails });
};

export const getUserLikes = async (id: string, langCode: string): Promise<AxiosResponse<any>> => {
  return API.post("/user-likes", { id, l2: langCode });
};

export const getUserWatchHistory = async (id: string, langCode: string): Promise<AxiosResponse<any>> => {
  return API.post("/user-watch-history", { id, l2: langCode });
};
