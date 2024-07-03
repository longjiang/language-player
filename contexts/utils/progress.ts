// @/utils/progress.ts
import { Progress, UserData } from '@/types';
import { getUserData, patchUserData } from '@/src/api/directus/user-data';
import { useAuth } from '@/contexts/AuthContext';

export const getProgress = (progress: Progress, langCode: string) => {
  return progress[langCode];
};

export const updateProgress = async (
  progress: Progress,
  setProgress: React.Dispatch<React.SetStateAction<Progress>>,
  userData: UserData | null,
  langCode: string,
  newProgress: { level: string; time: number },
  getStoredAuthToken: () => Promise<string | null>
): Promise<void> => {
  if (!userData) throw new Error('Cannot update progress when user data is not initialized');
  if (!progress) throw new Error('Cannot update progress when progress is not initialized');

  const updatedProgress: Progress = {
    ...progress,
    [langCode]: newProgress,
  };

  setProgress(updatedProgress);
  try {
    const authToken = await getStoredAuthToken();
    if (!authToken) throw new Error('No auth token found');
    await patchUserData(Number(userData.id), { progress: JSON.stringify(updatedProgress) }, authToken);
  } catch (error) {
    console.error('Error updating user data:', error);
  }
};
