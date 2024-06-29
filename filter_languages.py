import pandas as pd

# List of ISO 639-3 and ISO 639-1 codes to match
codes = [
    'af', 'ar', 'arb', 'as', 'az', 'be', 'bg', 'bn', 'bo', 'br', 'ca', 'cs', 'cy', 
    'da', 'de', 'el', 'en', 'eo', 'es', 'et', 'fa', 'fi', 'fr', 'ga', 'gd', 'gl', 
    'grc', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kac', 
    'kk', 'km', 'kn', 'ko', 'ku', 'ky', 'la', 'lb', 'lt', 'lv', 'lzh', 'mi', 'mk', 
    'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'nl', 'no', 'pa', 'pl', 'pt', 'ro', 'ru', 
    'sh', 'si', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 
    'uk', 'ur', 'uz', 'vi', 'yue', 'zh'
]

# Function to filter rows based on ISO 639 codes
def filter_iso_codes(input_csv, output_csv):
    # Read the input CSV file
    df = pd.read_csv(input_csv)
    
    # Filter the DataFrame based on the 'iso639-3' or 'iso639-1' columns
    filtered_df = df[(df['iso639-3'].isin(codes)) | (df['iso639-1'].isin(codes))]
    
    # Write the filtered DataFrame to a new CSV file without trailing newline
    filtered_df.to_csv(output_csv, index=False, line_terminator='\n')


# Usage
input_file = 'data/languages/all-languages.csv'  # Replace with your input file path
output_file = 'data/languages.csv'  # Replace with your desired output file path
filter_iso_codes(input_file, output_file)
