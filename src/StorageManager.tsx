// @/src/StorageManager.ts

import * as SecureStore from 'expo-secure-store';
import { User } from "@/src/api/directus/user";
import { UserData } from "@/contexts/UserDataContext";

export interface StorageData {
  authToken: string | null;
  userInfo: User | null;
  userData: UserData | null;
  tempPassword: string | null;
}

class StorageManager {
  private static instance: StorageManager;
  private storageData: StorageData = {
    authToken: null,
    userInfo: null,
    userData: null,
    tempPassword: null,
  };

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  async initialize(): Promise<void> {
    const authToken = await SecureStore.getItemAsync('authToken');
    const userInfo = await SecureStore.getItemAsync('userInfo');
    const userData = await SecureStore.getItemAsync('userData');
    const tempPassword = await SecureStore.getItemAsync('tempPassword');

    this.storageData = {
      authToken,
      userInfo: userInfo ? JSON.parse(userInfo) : null,
      userData: userData ? JSON.parse(userData) : null,
      tempPassword,
    };
  }

  async setAuthToken(token: string | null): Promise<void> {
    this.storageData.authToken = token;
    if (token) {
      await SecureStore.setItemAsync('authToken', token);
    } else {
      await SecureStore.deleteItemAsync('authToken');
    }
  }

  async setUserInfo(userInfo: User | null): Promise<void> {
    this.storageData.userInfo = userInfo;
    if (userInfo) {
      await SecureStore.setItemAsync('userInfo', JSON.stringify(userInfo));
    } else {
      await SecureStore.deleteItemAsync('userInfo');
    }
  }

  async setUserData(userData: UserData | null): Promise<void> {
    this.storageData.userData = userData;
    if (userData) {
      await SecureStore.setItemAsync('userData', JSON.stringify(userData));
    } else {
      await SecureStore.deleteItemAsync('userData');
    }
  }

  async setTempPassword(password: string): Promise<void> {
    this.storageData.tempPassword = password;
    await SecureStore.setItemAsync('tempPassword', password);
  }

  getAuthToken(): string | null {
    return this.storageData.authToken;
  }

  getUserInfo(): User | null {
    return this.storageData.userInfo;
  }

  getUserData(): UserData | null {
    return this.storageData.userData;
  }

  async getTempPassword(): Promise<string | null> {
    if (!this.storageData.tempPassword) {
      const tempPassword = await SecureStore.getItemAsync('tempPassword');
      this.storageData.tempPassword = tempPassword;
    }
    return this.storageData.tempPassword;
  }

  async clearTempPassword(): Promise<void> {
    this.storageData.tempPassword = null;
    await SecureStore.deleteItemAsync('tempPassword');
  }

  async clearAll(): Promise<void> {
    this.storageData = {
      authToken: null,
      userInfo: null,
      userData: null,
      tempPassword: null,
    };
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('userInfo');
    await SecureStore.deleteItemAsync('userData');
    await SecureStore.deleteItemAsync('tempPassword');
  }
}

export const storageManager = StorageManager.getInstance();