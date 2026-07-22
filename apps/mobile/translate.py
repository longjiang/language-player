import requests
import uuid
import os
import hashlib
import re

def replace_placeholders(text):
    """Replace placeholders with unique sequences."""
    placeholders = re.findall(r'{[^}]+}', text)
    modified_text = text
    for i, placeholder in enumerate(placeholders):
        modified_text = modified_text.replace(placeholder, f'{{{{PLACEHOLDER{i}}}}}', 1)
    return modified_text, placeholders

def restore_placeholders(translated_text, placeholders):
    """Restore original placeholders in the translated text."""
    for i, placeholder in enumerate(placeholders):
        translated_text = translated_text.replace(f'{{{{PLACEHOLDER{i}}}}}', placeholder, 1)
    return translated_text

def microsoft_translate_text(text, l1, l2, subscription_key):
    text, placeholders = replace_placeholders(text)

    cache_path = f'cache/translation/{l1}/{l2}'
    cache_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
    # Check if the translation is cached
    try:
        with open(cache_path + '/' + cache_hash, 'r') as f:
            data = f.read()
            if (len(data) > 0):
                return data
    except:
        pass

    # Add your subscription key and endpoint
    endpoint = "https://api.cognitive.microsofttranslator.com"

    # Add your location, also known as region. The default is global.
    # This is required if using a Cognitive Services resource.
    location = "westus"

    path = '/translate'
    constructed_url = endpoint + path

    params = {
        'api-version': '3.0',
        'from': l2,
        'to': [l1]
    }

    headers = {
        'Ocp-Apim-Subscription-Key': subscription_key,
        'Ocp-Apim-Subscription-Region': location,
        'Content-type': 'application/json',
        'X-ClientTraceId': str(uuid.uuid4())
    }

    # You can pass more than one object in body.
    body = [{'text': text}]

    request = requests.post(constructed_url, params=params, headers=headers, json=body)
    response = request.json()
    if (request.status_code != 200):
        raise Exception(f'Translation failed with status code {request.status_code} for text "{text[:30]}..." with response: ' + str(response))

    # ... [rest of your code remains unchanged, using modified_text]

    translated_text = response[0]['translations'][0]['text']
    translated_text = restore_placeholders(translated_text, placeholders)

    # Cache it to a file a hash as a name
    if not os.path.exists(cache_path):
        os.makedirs(cache_path)
    with open(cache_path + '/' + cache_hash, 'w') as f:
        f.write(translated_text)

    return translated_text