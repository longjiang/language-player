import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ToggleableBackground = () => {
  const [isMinimized, setIsMinimized] = useState(false);

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <View style={[
      styles.container,
      isMinimized ? styles.minimized : styles.maximized
    ]}>
      <TouchableOpacity style={styles.button} onPress={toggleMinimize}>
        <Text style={styles.buttonText}>
          {isMinimized ? 'Maximize' : 'Minimize'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maximized: {
    top: 0,
    bottom: 0,
    height: '100%',
    backgroundColor: 'purple',
  },
  minimized: {
    bottom: 100,
    backgroundColor: 'green',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    borderColor: 'white',
    borderWidth: 1,
  },
  buttonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default ToggleableBackground;