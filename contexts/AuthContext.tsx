// @/src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import {
  login as apiLogin,
  checkToken as apiCheckToken,
  fetchUserInfo,
  registerUser as apiRegisterUser,
  User,
} from "@/src/api/directus/user";


const AuthContext = createContext<{
  isAuthenticated: boolean;
  loading: boolean;
  userInfo: User | null;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleRegister: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  getStoredUserInfo: () => Promise<User | null>;
  getStoredAuthToken: () => Promise<string | null>;
} | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userInfo, setUserInfo] = useState<User | null>(null);

    useEffect(() => {
        const initializeAuth = async () => {
            const token = await SecureStore.getItemAsync('authToken');
            if (token) {
                const isValid = await apiCheckToken(token);
                if (isValid) {
                    setIsAuthenticated(true);
                    await fetchAndStoreUserInfo(token);
                } else {
                    await SecureStore.deleteItemAsync('authToken');
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, []);

    const fetchAndStoreUserInfo = async (token: string) => {
        const data = await fetchUserInfo(token);
        await SecureStore.setItemAsync('userInfo', JSON.stringify(data));
        setUserInfo(data);
    };

    const getStoredUserInfo = async (): Promise<User | null> => {
        const userInfo = await SecureStore.getItemAsync('userInfo');
        return userInfo ? JSON.parse(userInfo) : null;
    };

    const getStoredAuthToken = async (): Promise<string | null> => {
        const token = await SecureStore.getItemAsync('authToken');
        return token;
    }

    const handleLogin = async (email: string, password: string) => {
        setLoading(true);
        try {
            const token = await apiLogin(email, password);
            await SecureStore.setItemAsync('authToken', token);
            await fetchAndStoreUserInfo(token);
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

    const handleRegister = async (firstName: string, lastName: string, email: string, password: string) => {
        setLoading(true);
        try {
            await apiRegisterUser(firstName, lastName, email, password);
            await SecureStore.setItemAsync('userPassword', password);
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, userInfo, handleLogin, handleLogout, handleRegister, getStoredUserInfo, getStoredAuthToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
