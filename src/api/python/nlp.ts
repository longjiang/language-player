import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";


export const lemmatizeSpacy = async (lang: string, text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-spacy", { params: { lang, text } });
};

export const lemmatizeSimple = async (lang: string, text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-simple", { params: { lang, text } });
};

export const inflectPattern = async (lemma: string, lang: string): Promise<AxiosResponse<any>> => {
  return API.get("/inflect-pattern", { params: { lemma, lang } });
};

export const inflectPymorphy = async (lemma: string, lang: string): Promise<AxiosResponse<any>> => {
  return API.get("/inflect-pymorphy", { params: { lemma, lang } });
};

export const lemmatizeChinese = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-chinese", { params: { text } });
};

export const lemmatizeTurkish = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-turkish", { params: { text } });
};

export const lemmatizeArabic = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-arabic", { params: { text } });
};

export const lemmatizePersian = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-persian", { params: { text } });
};

export const lemmatizeJapanese = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-japanese", { params: { text } });
};

export const lemmatizeKorean = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-korean", { params: { text } });
};

export const lemmatizeRussian = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-russian", { params: { text } });
};

export const lemmatizeBurmese = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/lemmatize-burmese", { params: { text } });
};

export const transliteratePersian = async (text: string): Promise<AxiosResponse<any>> => {
  return API.get("/transliterate-persian", { params: { text } });
};