import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";

export const getPythonVersion = async (): Promise<AxiosResponse<any>> => {
  return API.get("/python_version");
};


export const getActiveUsersByCity = async (startDate: string): Promise<AxiosResponse<any>> => {
  return API.get("/ga-active-users-by-city", { params: { start_date: startDate } });
};

export const getPopularLanguagePairs = async (startDate: string): Promise<AxiosResponse<any>> => {
  return API.get("/ga-popular-language-pairs", { params: { start_date: startDate } });
};

export const getTopPagesByFeatures = async (startDate: string): Promise<AxiosResponse<any>> => {
  return API.get("/ga-popular-features", { params: { start_date: startDate } });
};