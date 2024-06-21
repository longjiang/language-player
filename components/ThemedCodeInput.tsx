import React, { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Keyboard } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

export const ThemedCodeInput = ({ onCodeFilled, codeLength = 6 }) => {
  const [code, setCode] = useState(new Array(codeLength).fill(''));
  const inputsRef = useRef([]);

  const handleInput = (text, index) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    if (text && index < codeLength - 1) {
      inputsRef.current[index + 1].focus();
    }
    if (newCode.join('').length === codeLength) {
      Keyboard.dismiss();
      onCodeFilled(newCode.join(''));
    }
  };

  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');

  return (
    <View style={styles.container}>
      {code.map((digit, index) => (
        <TextInput
          key={index}
          ref={el => (inputsRef.current[index] = el)}
          style={[styles.input, { borderColor, backgroundColor }]}
          onChangeText={(text) => handleInput(text, index)}
          value={digit}
          maxLength={1}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
  },
  input: {
    width: 40,
    height: 50,
    textAlign: 'center',
    fontSize: 24,
    borderWidth: 2,
    borderRadius: 8,
    color: 'white',
  },
});
