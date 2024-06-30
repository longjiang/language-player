import csv
import json
import os
from pathlib import Path

def csv_to_json(csv_filepath, json_filepath):
    # Read the entire CSV file as a single string
    with open(csv_filepath, 'r', encoding='utf-8') as csvfile:
        csv_data = csvfile.read()

    # Wrap the CSV data as a single string inside a JSON object
    wrapped_data = {
      "csvData": csv_data.strip()
    }

    # Write the JSON object to a file
    with open(json_filepath, 'w', encoding='utf-8') as jsonfile:
        json.dump(wrapped_data, jsonfile, indent=4)

def process_directory(csv_directory, json_directory):
    # Create the output directory if it doesn't already exist
    Path(json_directory).mkdir(parents=True, exist_ok=True)

    # Process each CSV file in the directory
    for filename in os.listdir(csv_directory):
        if filename.endswith('.csv'):
            csv_filepath = os.path.join(csv_directory, filename)
            json_filename = f"{Path(filename).stem}.json"
            json_filepath = os.path.join(json_directory, json_filename)
            csv_to_json(csv_filepath, json_filepath)
            print(f"Converted {csv_filepath} to {json_filepath}")

source_dir = 'data/languages'
export_dir = 'data/languages/json-export'
process_directory(source_dir, export_dir)
