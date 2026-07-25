// worker.js
self.onmessage = async (e) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'load':
      await loadDictionary(payload);
      break;
    case 'search':
      const results = searchDictionary(payload);
      postMessage({ type: 'results', payload: results });
      break;
  }
};

let dictionary = {};

async function loadDictionary(url) {
  const response = await fetch(url);
  const text = await response.text();
  const lines = text.split('\n');
  for (let line of lines) {
    const [hskId, simplified, traditional, pinyin, definitions, book, hsk, lesson, dialog, nw, example, exampleTranslation, oofc, pn, weight, index] = line.split(',');
    dictionary[simplified] = { traditional, pinyin, definitions, example, exampleTranslation };
  }
}

function searchDictionary(word) {
  return dictionary[word] || {};
}
