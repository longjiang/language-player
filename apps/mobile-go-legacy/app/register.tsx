// @/app/register.tsx

import React, { useState } from 'react';
import { useT } from '@/hooks/use-t';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ThemedScreen } from '@/components/ThemedScreen';
import { ThemedInput } from '@/components/ThemedInput';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Link } from 'expo-router';
import { router } from 'expo-router';
import { registerUser } from '@/src/api/directus/user';
import { sendVerificationEmail } from '@/src/api/python/verify-email';
import { useLanguage } from "@/contexts/LanguageContext"; 
import { registerScreenStyles as styles } from '@/src/styles';
import { storageManager } from "@/src/StorageManager";

const RegisterScreen = () => {
    const t = useT();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
      if (password !== confirmPassword) {
          Alert.alert('Error', t('error.passwords_do_not_match'));
          return;
      }

      setLoading(true);
      try {
          await registerUser(firstName, lastName, email, password);
          await sendVerificationEmail(email);
          
          // Store the password temporarily
          await storageManager.setTempPassword(password);
          
          router.push({ pathname: '/verify-email', params: { email } });
      } catch (error) {
          Alert.alert('Error', t('error.registration_failed'));
      } finally {
          setLoading(false);
      }
    };

    return (
        <ThemedScreen
          title={t('title.register')}
          onBackPress={() => router.navigate("/")}
          imageHeight={150}
        >
            <View style={styles.row}>
                <ThemedInput
                    style={{...styles.input, flex: 1}}
                    onChangeText={setFirstName}
                    value={firstName}
                    placeholder={t('placeholder.first_name')}
                />
                <ThemedInput
                    style={{...styles.input, flex: 1}}
                    onChangeText={setLastName}
                    value={lastName}
                    placeholder={t('placeholder.last_name')}
                    icon="account"
                />
            </View>
            <ThemedInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder={t('placeholder.email')}
                icon="email"
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                placeholder={t('placeholder.password')}
                secureTextEntry
                icon="lock"
            />
            <ThemedInput
                style={styles.input}
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                placeholder={t('placeholder.confirm_password')}
                secureTextEntry
                icon="lock"
            />

            <ThemedButton title={t('action.register')} onPress={handleRegister} disabled={loading} />

            <TouchableOpacity style={styles.textButton}>
                <ThemedText type="subtitle">{t('msg.already_have_account')} <Link href='/login' style={{ color: useThemeColor({}, 'primaryLink'), fontWeight: 'bold' }}>{t('action.login')}</Link></ThemedText>
            </TouchableOpacity>
        </ThemedScreen>
    );
};

export default RegisterScreen;