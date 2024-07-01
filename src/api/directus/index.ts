// @/api/directus/index.js

import axios, { AxiosInstance, AxiosResponse } from "axios";

export const DIRECTUS_URL = "https://directusvps.zerotohero.ca/zerotohero";

export interface GenericCollectionItem {
  [key: string]: any; // This allows any property of any type
}

const API: AxiosInstance = axios.create({
  baseURL: DIRECTUS_URL,
});

// Using generics in functions
const getCollectionItems = async <T = GenericCollectionItem>(
  collectionName: string,
  queryParams: Record<string, any> = {},
  authToken?: string
): Promise<T[]> => {
  const queryString = new URLSearchParams(buildParams(queryParams)).toString();
  const url = `/items/${collectionName}${queryString ? `?${queryString}` : ""}`;

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const response: AxiosResponse<{ data: T[] }> = await API.get(url, { headers });
  return response.data.data;
};

const getItemById = async <T = GenericCollectionItem>(
  collectionName: string,
  id: number,
  authToken?: string
): Promise<T> => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const response: AxiosResponse<{ data: T }> = await API.get(
    `/items/${collectionName}/${id}`,
    { headers }
  );
  return response.data.data;
};

const getUserSubscriptions = async (
  userId: string,
  authToken?: string
): Promise<GenericCollectionItem[]> => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const url = `/items/subscriptions?filter[owner][eq]=${userId}`;

  const response: AxiosResponse<{ data: GenericCollectionItem[] }> = await API.get(url, { headers });
  return response.data.data;
};

/**
 * Serialize an object into a URLSearchParams object. E.g. it takes an object like:
 * {
 *      filter: {
 *          title: { contains: 'abc' },
 *          category: { in: [4, 9, 10] }
 *      }
 *  }
 *
 * and returns a URLSearchParams object, which can be serialized into a query string like &filter[title][contains]=abc&filter[category][in]=4&filter[category][in]=9&filter[category][in]=10
 * @param obj
 * @param parentKey
 * @returns
 */
function buildParams(
  obj: Record<string, any>,
  parentKey: string = ""
): URLSearchParams {
  const params: URLSearchParams = new URLSearchParams();

  // Helper function to add parameters to URLSearchParams.
  const addParam = (key: string, value: any): void => {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.append(key, value);
    }
  };

  // Recursive function to handle nested objects and arrays.
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

export { getCollectionItems, getItemById, getUserSubscriptions };
