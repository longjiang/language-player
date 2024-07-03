// @/src/api/directus/user-data

// Import necessary functions and types
import { getCollectionItems, GenericCollectionItem, patchCollectionItem } from '.';

/**
 * Fetches the first item from the 'user_data' collection.
 * 
 * @param authToken Optional authorization token for accessing the collection.
 * @returns A promise that resolves to the first item of the 'user_data' collection or undefined if no items are found.
 */
export const getUserData = async (authToken?: string): Promise<GenericCollectionItem | undefined> => {
  try {
    // Fetch the first item by setting the limit to 1
    const items = await getCollectionItems<GenericCollectionItem>('user_data', { limit: 1 }, authToken);
    // Return the first item, or undefined if no items were returned
    const userData = items[0];
    userData.saved_words = JSON.parse(userData.saved_words);
    userData.progress = JSON.parse(userData.progress);
    return userData;
  } catch (error) {
    console.error('Failed to fetch the first item from user_data collection:', error);
    throw error;
  }
};

/**
 * Updates an item in the 'user_data' collection.
 * 
 * @param id The ID of the item to be updated.
 * @param updatedData The updated data for the item.
 * @param authToken Optional authorization token for accessing the collection.
 * @returns A promise that resolves to the updated item.
 */
export const patchUserData = async (id: number, updatedData: Partial<GenericCollectionItem>, authToken?: string): Promise<GenericCollectionItem> => {
  try {
    const updatedItem = await patchCollectionItem<GenericCollectionItem>('user_data', id, updatedData, authToken);
    return updatedItem;
  } catch (error) {
    console.error('Failed to update the item in user_data collection:', error);
    throw error;
  }
};