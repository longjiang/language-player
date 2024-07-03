// @/src/api/directus/subscriptions

import { AxiosResponse } from "axios";
import { GenericCollectionItem } from "."

export const getUserSubscriptions = async (
  userId: string,
  authToken?: string
): Promise<GenericCollectionItem[]> => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const url = `/items/subscriptions?filter[owner][eq]=${userId}`;

  const response: AxiosResponse<{ data: GenericCollectionItem[] }> = await API.get(url, { headers });
  return response.data.data;
};