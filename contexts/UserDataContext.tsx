// @/contexts/UserDataContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData } from '@/src/api/directus/user-data'; // Make sure this path is correct

const UserDataContext = createContext();

export const UserDataProvider = ({ children }) => {
  const { getStoredAuthToken } = useAuth();
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = await getStoredAuthToken();
        const data = await getUserData(authToken);
        setUserData(data);
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, [getStoredAuthToken]);

  return (
    <UserDataContext.Provider value={{ userData }}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = () => {
  return useContext(UserDataContext);
};
