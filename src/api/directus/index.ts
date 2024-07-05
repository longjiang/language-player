// @/api/directus/index.js

import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";

export const DIRECTUS_URL = "https://directusvps.zerotohero.ca/zerotohero";
export const DIRECTUS_URL_ALT = "https://db2.zerotohero.ca/zerotohero";

let currentBaseUrl = DIRECTUS_URL;

const API: AxiosInstance = axios.create({
  baseURL: currentBaseUrl,
});

const switchBaseUrl = () => {
  currentBaseUrl = currentBaseUrl === DIRECTUS_URL ? DIRECTUS_URL_ALT : DIRECTUS_URL;
  API.defaults.baseURL = currentBaseUrl;
};

const handleRequest = async <T>(requestFunc: () => Promise<AxiosResponse<T>>): Promise<T> => {
  try {
    const response = await requestFunc();
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.isAxiosError && (axiosError.code === 'ECONNABORTED' || !axiosError.response)) {
      // If timeout or no response, switch base URL and retry
      switchBaseUrl();
      const retryResponse = await requestFunc();
      return retryResponse.data;
    }
    throw error;
  }
};

export interface GenericCollectionItem {
  [key: string]: any; // This allows any property of any type
}

export const getCollectionItems = async <T = GenericCollectionItem>(
  collectionName: string,
  queryParams: Record<string, any> = {},
  authToken?: string,
  cacheBusting: boolean = false
): Promise<T[]> => {
  if (cacheBusting) {
    queryParams._ = new Date().getTime(); // Add cache-busting parameter
  }

  const queryString = new URLSearchParams(buildParams(queryParams)).toString();
  const url = `/items/${collectionName}${queryString ? `?${queryString}` : ""}`;

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  return handleRequest(() => API.get<{ data: T[] }>(url, { headers })).then(data => data.data);
};

export const getItemById = async <T = GenericCollectionItem>(
  collectionName: string,
  id: number,
  authToken?: string,
  cacheBusting: boolean = false
): Promise<T> => {
  const url = `/items/${collectionName}/${id}${
    cacheBusting ? `?_=${new Date().getTime()}` : ""
  }`;

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  return handleRequest(() => API.get<{ data: T }>(url, { headers })).then(data => data.data);
};

export const postCollectionItem = async <T = GenericCollectionItem>(
  collectionName: string,
  item: T,
  authToken?: string
): Promise<T> => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  return handleRequest(() => API.post<{ data: T }>(`/items/${collectionName}`, item, { headers })).then(data => data.data);
};

export const patchCollectionItem = async <T = GenericCollectionItem>(
  collectionName: string,
  id: number,
  updatedData: Partial<T>,
  authToken?: string
): Promise<T> => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  return handleRequest(() => API.patch<{ data: T }>(`/items/${collectionName}/${id}`, updatedData, { headers })).then(data => data.data);
};

function buildParams(
  obj: Record<string, any>,
  parentKey: string = ""
): URLSearchParams {
  const params: URLSearchParams = new URLSearchParams();

  const addParam = (key: string, value: any): void => {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.append(key, value);
    }
  };

  const recurseParams = (
    currentObject: Record<string, any>,
    parentPrefix: string
  ): void => {
    Object.keys(currentObject).forEach((key) => {
      const value = currentObject[key];
      const fullKey = parentPrefix ? `${parentPrefix}[${key}]` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        recurseParams(value, fullKey);
      } else {
        addParam(fullKey, value);
      }
    });
  };

  recurseParams(obj, parentKey);
  return params;
}
