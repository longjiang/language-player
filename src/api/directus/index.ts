import axios, { AxiosInstance, AxiosResponse } from "axios";

interface GenericCollectionItem {
  [key: string]: any; // This allows any property of any type
}

const API: AxiosInstance = axios.create({
  baseURL: "https://directusvps.zerotohero.ca/zerotohero",
});

// Using generics in functions
const getCollectionItems = async <T = GenericCollectionItem>(
  collectionName: string,
  queryParams: Record<string, any> = {}
): Promise<T[]> => {
  const queryString = new URLSearchParams(buildParams(queryParams)).toString();
  const url = `/items/${collectionName}${queryString ? `?${queryString}` : ""}`;

  const response: AxiosResponse<{ data: T[] }> = await API.get(url);
  return response.data.data;
};

const getItemById = async <T = GenericCollectionItem>(
  collectionName: string,
  id: number
): Promise<T> => {
  const response: AxiosResponse<{ data: T }> = await API.get(
    `/items/${collectionName}/${id}`
  );
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

export { getCollectionItems, getItemById };
