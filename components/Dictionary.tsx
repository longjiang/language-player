import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Worker } from 'react-native-worker-thread';

const Dictionary = () => {
  const [worker, setWorker] = useState(null);
  const [input, setInput] = useState('');
  const [definition, setDefinition] = useState('');

  useEffect(() => {
    const newWorker = new Worker(require.resolve('./worker.js'));
    setWorker(newWorker);
    newWorker.postMessage({ type: 'load', payload: 'https://example.com/dictionary.csv' });

    newWorker.onmessage = (event) => {
      if (event.data.type === 'results') {
        setDefinition(event.data.payload.definitions || 'No definition found.');
      }
    };

    return () => newWorker.terminate();
  }, []);

  const search = (word) => {
    worker.postMessage({ type: 'search', payload: word });
  };

  return (
    <View>
      <TextInput value={input} onChangeText={setInput} onSubmitEditing={() => search(input)} />
      <Text>Definition: {definition}</Text>
    </View>
  );
};

export default Dictionary;
