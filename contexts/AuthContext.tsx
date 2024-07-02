// @/src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login, checkToken } from '@/src/api/directus/login';
import { fetchAndStoreUserInfo } from '@/src/api/directus/user';
import { router } from 'expo-router';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

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

    const handleLogin = async (email, password) => {
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
        setIsAuthenticated(false);
        router.navigate("/login");
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, handleLogin, handleLogout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
