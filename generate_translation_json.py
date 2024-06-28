import pandas as pd
import json

def nested_dict_insert(nested_dict, keys, value):
    """ Recursively insert nested keys into a dictionary """
    for key in keys[:-1]:
        nested_dict = nested_dict.setdefault(key, {})
    nested_dict[keys[-1]] = value

# Load the CSV file
data = pd.read_csv("data/lp3-translations.csv")  # Update with the path to your CSV file

# Iterate through each language column (except the first 'key' column)
for column in data.columns[1:]:
    nested_translations = {}
    for _, row in data.iterrows():
        keys = row['key'].split('.')
        value = row[column]
        if pd.notna(value):  # Only insert non-null values
            nested_dict_insert(nested_translations, keys, value)
    
    # Create or update a JSON file for each language
    with open(f"assets/localizations/{column}.json", 'w', encoding='utf-8') as f:
        json.dump(nested_translations, f, ensure_ascii=False, indent=4)

print("Nested JSON translation files files have been created.")
