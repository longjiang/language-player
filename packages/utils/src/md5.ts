import SparkMD5 from 'spark-md5';

/** Compute MD5 hash matching Python's hashlib.md5. Used for token cache keys. */
export function md5(text: string): string {
  return SparkMD5.hash(text);
}
