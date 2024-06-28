import os
from dotenv import load_dotenv
import pandas as pd
from translate import microsoft_translate_text

# Load environment variables
load_dotenv()

# Access the API key
subscription_key = os.getenv('TRANSLATE_API_KEY')

def fill_translations(file_path):
    df = pd.read_csv(file_path)
    languages = df.columns[2:]  # assuming 'key' and 'en' are the first two columns

    for index, row in df.iterrows():
        english_text = row['en']
        for lang in languages:
            if pd.isna(row[lang]):  # checking for missing translations
                try:
                    translated_text = microsoft_translate_text(english_text, lang, 'en', subscription_key)
                    df.at[index, lang] = translated_text  # updating the dataframe with the translated text
                    print(f"Translated to {lang}: {translated_text[:50]}...")  # print part of the translation
                except Exception as e:
                    print(f"Error translating to {lang}: {str(e)}")

    df.to_csv(file_path, index=False)  # write the updated dataframe back to CSV
    print("All missing translations have been updated.")

# Example usage
fill_translations('data/lp3-trans-langs.csv')
