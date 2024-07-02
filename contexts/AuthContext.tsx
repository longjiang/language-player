// @/src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login, checkToken } from '@/src/api/directus/login';
import { DIRECTUS_URL } from '@/src/api/directus';
import { router } from 'expo-router';

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  last_access_on: string;
  role: number;
  status: string;
};

const AuthContext = createContext<{
  isAuthenticated: boolean;
  loading: boolean;
  userInfo: User | null;
  handleLogin: (email: any, password: any) => Promise<void>;
  handleLogout: () => Promise<void>;
  getStoredUserInfo: () => Promise<User | null>;
} | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userInfo, setUserInfo] = useState<User | null>(null);

    useEffect(() => {
        const initializeAuth = async () => {
            const token = await SecureStore.getItemAsync('authToken');
            if (token) {
                const isValid = await checkToken(token);
                if (isValid) {
                    setIsAuthenticated(true);
                    await fetchAndStoreUserInfo();
                } else {
                    await SecureStore.deleteItemAsync('authToken');
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, []);

    const fetchAndStoreUserInfo = async () => {
        const token = await SecureStore.getItemAsync('authToken');
        if (!token) throw new Error('No access token found');

        const response = await fetch(`${DIRECTUS_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            await SecureStore.setItemAsync('userInfo', JSON.stringify(data.data));
            setUserInfo(data.data);
        } else {
            throw new Error(data.errors ? data.errors[0].message : 'Failed to fetch user info');
        }
    };

    const getStoredUserInfo = async (): Promise<User | null> => {
        const userInfo = await SecureStore.getItemAsync('userInfo');
        return userInfo ? JSON.parse(userInfo) : null;
    };

    const handleLogin = async (email: string, password: string) => {
        setLoading(true);
        try {
            const token = await login(email, password);
            await SecureStore.setItemAsync('authToken', token);
            await fetchAndStoreUserInfo();
            setIsAuthenticated(true);
            router.navigate("/account");
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await SecureStore.deleteItemAsync('authToken');
        await SecureStore.deleteItemAsync('userInfo');
        setUserInfo(null);
        setIsAuthenticated(false);
        router.navigate("/login");
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, userInfo, handleLogin, handleLogout, getStoredUserInfo }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
