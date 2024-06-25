import axios from 'axios';

const API = axios.create({
  baseURL: 'https://directusvps.zerotohero.ca/zerotohero',
});

const getCollectionItems = async (collectionName, queryParams = {}) => {
  try {
    // Construct query string from queryParams object
    const queryString = new URLSearchParams(buildParams(queryParams)).toString();
    const url = `/items/${collectionName}${queryString ? `?${queryString}` : ''}`;

    const response = await API.get(url);
    return response.data.data; // Directus API returns data in the `data` field
  } catch (error) {
    console.error('Error fetching collection items:', error);
    throw error;
  }
};

const getItemById = async (collectionName, id) => {
  try {
    const response = await API.get(`/items/${collectionName}/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching item:', error);
    throw error;
  }
};

/**
 * Serialize an object into a URLSearchParams object. E.g. it takes an object like:
 * {
        filter: {
            title: { contains: 'abc' },
            category: { in: [4, 9, 10] }
        }
    }
 * and returns a URLSearchParams object, which can be serialized into a query string like &filter[title][contains]=abc&filter[category][in]=4&filter[category][in]=9&filter[category][in]=10
 * @param obj 
 * @param parentKey 
 * @returns 
 */
function buildParams(obj, parentKey = '') {
  const params = new URLSearchParams();

  const addParam = (key, value) => {
      if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
      } else {
          params.append(key, value);
      }
  };

  const buildParams = (currentObject, parentPrefix) => {
      Object.keys(currentObject).forEach(key => {
          const value = currentObject[key];
          let fullKey = parentPrefix ? `${parentPrefix}[${key}]` : key;
          if (value && typeof value === 'object' && !Array.isArray(value)) {
              buildParams(value, fullKey);
          } else {
              addParam(fullKey, value);
          }
      });
  };

  buildParams(obj, parentKey);
  return params;
}

export { getCollectionItems, getItemById };
