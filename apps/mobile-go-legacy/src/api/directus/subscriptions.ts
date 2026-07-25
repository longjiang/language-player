// @/src/api/directus/subscriptions

import { AxiosResponse } from "axios";
import { GenericCollectionItem, getCollectionItems } from "."

export const getUserSubscription = async (
  userId: string,
  authToken?: string
): Promise<GenericCollectionItem | null> => {
  const queryParams = { filter: { owner: { eq: userId } } };

  const subscriptions: GenericCollectionItem[] = await getCollectionItems<GenericCollectionItem>(
    "subscriptions",
    queryParams,
    authToken,
    true // cache busting
  );

  if (subscriptions.length > 0) {
    return subscriptions[0];
  } else {
    return null;
  }
};
